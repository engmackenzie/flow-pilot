import { getInitialPrompt } from '../utils/getIntialPrompt.js';
import { getWorkflowPrompt } from '../utils/getWorkflowPrompt.js';
import { extractInteractiveElements, getExtractionStats } from '../utils/interactiveElementsExtractor.js';

let isRecording = false;

// Get DOM elements
const captureButton = document.getElementById("captureButton");
const questionInput = document.getElementById("questionInput");
const askButton = document.getElementById("askButton");
const workflowStatus = document.getElementById("workflowStatus");
const thinkingStatus = document.getElementById("thinkingStatus");
const workflowSteps = document.getElementById("workflowSteps");
const stepsList = document.getElementById("stepsList");
const startWorkflow = document.getElementById("startWorkflow");
const stopWorkflow = document.getElementById("stopWorkflow");
const clearWorkflow = document.getElementById("clearWorkflow");
const captureSection = document.getElementById("captureSection");
const downloadModal = document.getElementById("downloadModal");
const closeModal = document.getElementById("closeModal");
const cancelDownload = document.getElementById("cancelDownload");
const confirmDownload = document.getElementById("confirmDownload");

// Workflow state
let currentWorkflow = null;
let isExecuting = false;
let currentTabId = null;

// AI session state
let aiSession = null;
let isAISessionReady = false;
let aiSessionParams = null;
let pendingQuestion = null;

// Initialize AI session on page load
document.addEventListener('DOMContentLoaded', async () => {
  console.log("FlowPilot: Extension loaded, checking AI availability");
  await initializeAISession();
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  cleanupAISession();
});

// Modal event listeners
closeModal.addEventListener("click", () => {
  downloadModal.style.display = 'none';
});

cancelDownload.addEventListener("click", () => {
  downloadModal.style.display = 'none';
});

confirmDownload.addEventListener("click", async () => {
  downloadModal.style.display = 'none';
  
  // Show thinking status for download
  thinkingStatus.style.display = 'flex';
  const thinkingText = document.querySelector('.thinking-text');
  if (thinkingText) {
    thinkingText.textContent = "Starting AI model download...";
  }
  
  // Start download process
  await startDownloadProcess();
});

// Close modal when clicking outside
downloadModal.addEventListener("click", (e) => {
  if (e.target === downloadModal) {
    downloadModal.style.display = 'none';
  }
});

// Ask button functionality
askButton.addEventListener("click", async () => {
  const question = questionInput.value.trim();
  if (question) {
    // Store the question for later use
    pendingQuestion = question;
    
    // Request AI permissions and initialize session if needed
    try {
      await initializeAISession();
      await handleQuestion(question);
    } catch (error) {
      console.error("FlowPilot: Permission request failed:", error);
      // Continue without AI
      await handleQuestion(question);
    }
  }
});

// Enter key support for textarea (Ctrl+Enter to submit)
questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.ctrlKey) {
    const question = questionInput.value.trim();
    if (question) {
      handleQuestion(question);
    }
  }
});

// Workflow control buttons
startWorkflow.addEventListener("click", () => {
  if (currentWorkflow) {
    executeWorkflow(currentWorkflow);
  }
});

stopWorkflow.addEventListener("click", () => {
  stopWorkflowExecution();
});

clearWorkflow.addEventListener("click", () => {
  clearWorkflowState();
});

async function handleQuestion(question) {
  console.log("User asked question", { question });
  
  // Visual debugging - show question in thinking status
  const thinkingText = document.querySelector('.thinking-text');
  if (thinkingText) {
    thinkingText.textContent = `Thinking about: "${question}"...`;
  }
  
  // Show thinking status and disable ask button
  thinkingStatus.style.display = 'flex';
  askButton.disabled = true;
  askButton.style.opacity = '0.6';
  askButton.style.cursor = 'not-allowed';
  
  try {
    // Get current tab and capture screenshot + HTML
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const currentUrl = tabs[0].url;
      console.log("Got current tab", { url: currentUrl, tabId: tabs[0].id });
    
    // Capture screenshot and HTML for analysis
    captureScreenshotAndHTML(tabs[0].id, async (screenshotData, htmlData) => {
        console.log("Screenshot and HTML captured", { 
          hasScreenshot: !!screenshotData, 
          htmlLength: htmlData ? htmlData.length : 0 
        });
        
        // // Hide thinking status, show screenshot status
        // thinkingStatus.style.display = 'none';
        // screenshotStatus.style.display = 'flex';
        
        // Get stored workflows for this question/site
        const storedWorkflows = getStoredWorkflows(question, currentUrl);
        console.log("Found stored workflows", { count: storedWorkflows.length, workflows: storedWorkflows });
        
        // Visual debugging - update status
        if (thinkingText) {
          thinkingText.textContent = `Found ${storedWorkflows.length} stored workflows, analyzing with AI...`;
        }
        
        // Send to AI model with context
        const aiResponse = await getAIWorkflowResponse(question, currentUrl, screenshotData, htmlData, storedWorkflows);
        console.log("AI response received", aiResponse);
        
        // Visual debugging - show AI response
        if (thinkingText) {
          thinkingText.textContent = `AI generated ${aiResponse.steps ? aiResponse.steps.length : 0} steps`;
        }
        
        // Hide all status indicators
        screenshotStatus.style.display = 'none';
        thinkingStatus.style.display = 'none';
        

        showWorkflowSteps(question, aiResponse.steps);
      });
    });
  } catch (error) {
    console.log("Error processing question", error);
    
    // Hide all status indicators
    screenshotStatus.style.display = 'none';
    thinkingStatus.style.display = 'none';
    
    showGenericResponse(question, "Unknown Site");
  } finally {
    // Re-enable ask button
    askButton.disabled = false;
    askButton.style.opacity = '1';
    askButton.style.cursor = 'pointer';
  }
  
  // Clear the input
  questionInput.value = "";
}

function captureScreenshotAndHTML(tabId, callback) {
  // Capture screenshot
  chrome.tabs.captureVisibleTab(null, { format: 'png' }, (screenshotData) => {
    if (chrome.runtime.lastError) {
      console.error("FlowPilot: Screenshot error:", chrome.runtime.lastError);
      callback(null, null);
      return;
    }
    
    console.log("FlowPilot: Screenshot captured successfully");
    
    // First check if content script is ready, then get HTML
    chrome.tabs.sendMessage(tabId, { type: "ping" }, (response) => {
      if (chrome.runtime.lastError) {
        console.log("FlowPilot: Content script not ready for HTML extraction, injecting...");
        
        // Inject content script if needed
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content/content.js']
        }, () => {
          if (chrome.runtime.lastError) {
            console.error("FlowPilot: Error injecting content script for HTML:", chrome.runtime.lastError);
        callback(screenshotData, null);
            return;
          }
          
          // Wait for script to load, then get HTML
          setTimeout(() => {
            getHTMLFromContentScript(tabId, screenshotData, callback);
          }, 500);
        });
      } else {
        // Content script is ready, get HTML directly
        getHTMLFromContentScript(tabId, screenshotData, callback);
      }
    });
  });
}

function getHTMLFromContentScript(tabId, screenshotData, callback) {
  chrome.tabs.sendMessage(tabId, { type: "getHTML" }, (htmlData) => {
    if (chrome.runtime.lastError) {
      console.error("FlowPilot: HTML extraction error:", chrome.runtime.lastError);
      callback(screenshotData, null);
    } else {
      console.log("FlowPilot: HTML extracted successfully, length:", htmlData ? htmlData.length : 0);
      
      // Extract interactive elements instead of sending full HTML
      if (htmlData && htmlData.length > 0) {
        // Get current URL for context-aware extraction
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const currentUrl = tabs[0] ? tabs[0].url : '';
          const interactiveElements = extractInteractiveElements(htmlData, currentUrl);
          const stats = getExtractionStats(htmlData.length, interactiveElements.length);
          console.log("FlowPilot: Interactive elements extraction stats:", stats);
          callback(screenshotData, interactiveElements);
        });
      } else {
        callback(screenshotData, htmlData);
      }
    }
  });
}

// Get stored workflows for a specific question and URL
function getStoredWorkflows(question, url) {
  // This would typically query a database or storage
  // For now, return empty array - you can implement storage logic here
  console.log("FlowPilot: Getting stored workflows for:", question, "on", url);
  return [];
}

// Get AI workflow response with all context
async function getAIWorkflowResponse(question, url, screenshotData, interactiveElementsData, storedWorkflows) {
  try {
    // Check if AI session is ready
    if (!isAISessionReady || !aiSession) {
      console.log("FlowPilot: AI session not ready, using fallback");
      return { steps: [] };
    }

    console.log(`FlowPilot: Using existing AI session. Usage: ${aiSession.inputUsage}/${aiSession.inputQuota}`);

    // Create the prompt with interactive elements data
    const prompt = getWorkflowPrompt(question, url, screenshotData, interactiveElementsData, storedWorkflows);
    
    // Get AI response with timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const response = await aiSession.prompt(prompt, { signal: controller.signal });
      clearTimeout(timeoutId);
      console.log("FlowPilot: AI response:", response);
      
      // Parse the response
      return parseWorkflowResponse(response);
    } catch (promptError) {
      clearTimeout(timeoutId);
      
      if (promptError.name === 'AbortError') {
        console.error("FlowPilot: AI prompt timed out");
        return { steps: [], error: "AI request timed out" };
      } else {
        throw promptError;
      }
    }
    
  } catch (error) {
    console.error("FlowPilot: AI model error:", error);
    return { steps: [] };
  }
}

// Parse AI response into workflow object
function parseWorkflowResponse(response) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // If no JSON found, try to parse the entire response
    return JSON.parse(response);
  } catch (error) {
    console.error("FlowPilot: Failed to parse AI response:", error);
    return { steps: [] };
  }
}

// Initialize AI Session
async function initializeAISession() {
  // If session is already ready, return
  if (isAISessionReady && aiSession) {
    console.log("FlowPilot: AI session already ready");
    return true;
  }

  try {
    // Check model availability
    let availability = await LanguageModel.availability();
    console.log("FlowPilot: AI availability:", availability);
    
    if (availability === 'unavailable') {
      console.log("FlowPilot: AI model unavailable");
      return false;
    }

    // Handle model download if needed
    if (availability === 'downloadable') {
      console.log("FlowPilot: Model needs to be downloaded");
      
      // Show download confirmation modal
      downloadModal.style.display = 'flex';
      return false; // Don't proceed with initialization yet
    }
    
    if (availability === 'downloading') {
      console.log("FlowPilot: Model is currently downloading");
      // Continue with download monitoring
    }

    // Get model parameters
    aiSessionParams = await LanguageModel.params();
    console.log("FlowPilot: AI model params:", aiSessionParams);

    // Create AI session with proper initial prompts and download monitoring
    aiSession = await LanguageModel.create({
      initialPrompts: [
        getInitialPrompt(),
      ],
      temperature: 0.7,
      topK: 1,
      outputLanguage: "en", // Specify English as output language
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          const progress = Math.round(e.loaded * 100);
          console.log(`FlowPilot: Model download progress: ${progress}%`);
          
          // Update UI with download progress
          const thinkingText = document.querySelector('.thinking-text');
          if (thinkingText) {
            thinkingText.textContent = `Downloading AI model... ${progress}%`;
          }
        });
      }
    });

    isAISessionReady = true;
    console.log("FlowPilot: AI session initialized successfully");
    console.log(`FlowPilot: Session usage: ${aiSession.inputUsage}/${aiSession.inputQuota}`);
    
    return true;
    
  } catch (error) {
    console.error("FlowPilot: Error initializing AI session:", error);
    isAISessionReady = false;
    aiSession = null;
    return false;
  }
}

// Start download process and monitor progress
async function startDownloadProcess() {
  try {
    const thinkingText = document.querySelector('.thinking-text');
    
    // Start the download by creating the session
    console.log("FlowPilot: Starting AI model download...");
    
    // Create AI session with download monitoring
    aiSession = await LanguageModel.create({
      initialPrompts: [
        getInitialPrompt(),
      ],
      temperature: 0.7,
      topK: 1,
      outputLanguage: "en",
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          const progress = Math.round(e.loaded * 100);
          console.log(`FlowPilot: Model download progress: ${progress}%`);
          
          // Update UI with download progress
          if (thinkingText) {
            thinkingText.textContent = `Downloading AI model... ${progress}%`;
          }
        });
      }
    });
    
    // Wait for download to complete by checking availability
    let availability = 'downloading';
    while (availability === 'downloading') {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second
      availability = await LanguageModel.availability();
      console.log("FlowPilot: Download status:", availability);
    }
    
    if (availability === 'available') {
      console.log("FlowPilot: Download completed successfully");
      isAISessionReady = true;
      
      // Hide thinking status
      thinkingStatus.style.display = 'none';
      
      // Process pending question if there is one
      if (pendingQuestion) {
        await handleQuestion(pendingQuestion);
        pendingQuestion = null;
      }
    } else {
      throw new Error(`Download failed with availability: ${availability}`);
    }
    
  } catch (error) {
    console.error("FlowPilot: Error during download process:", error);
    thinkingStatus.style.display = 'none';
    
    // Show error to user
    if (pendingQuestion) {
      showGenericResponse(pendingQuestion, "Unknown Site");
      pendingQuestion = null;
    }
  }
}

function showWorkflowSteps(question, steps) {
  console.log("FlowPilot: Showing workflow steps:", steps);
  
  // Store current workflow
  currentWorkflow = { question, steps };
  
  // Hide capture section during workflow
  captureSection.style.display = 'none';
  
  // Show workflow steps UI
  workflowSteps.style.display = 'block';
  
  // Render steps
  renderWorkflowSteps(steps);
  
  // Show start button
  startWorkflow.style.display = 'flex';
  stopWorkflow.style.display = 'none';
}

function renderWorkflowSteps(steps) {
  stepsList.innerHTML = '';
  
  steps.forEach((step, index) => {
    const stepElement = document.createElement('div');
    stepElement.className = 'step-item';
    stepElement.id = `step-${index}`;
    
    // Convert technical step to user-friendly description
    const userDescription = convertToUserFriendlyStep(step);
    
    stepElement.innerHTML = `
      <div class="step-number">${index + 1}</div>
      <div class="step-content">
        <div class="step-description">${userDescription}</div>
        <div class="step-status">Ready</div>
      </div>
    `;
    
    stepsList.appendChild(stepElement);
  });
}

function convertToUserFriendlyStep(step) {
  switch (step.action) {
    case 'analyze':
      return `<i class="fas fa-search"></i> ${step.description || 'Analyzing the page to understand the interface'}`;
    case 'click':
      return `<i class="fas fa-mouse-pointer"></i> ${step.description || 'Click on the button or element'}`;
    case 'type':
      return `<i class="fas fa-keyboard"></i> ${step.description || `Type "${step.text || 'text'}" in the input field`}`;
    case 'wait':
      return `<i class="fas fa-clock"></i> ${step.description || `Wait ${step.duration ? Math.round(step.duration/1000) : 2} seconds for the page to load`}`;
    case 'look':
      return `<i class="fas fa-eye"></i> ${step.description || 'Look for the next element on the page'}`;
    default:
      return `<i class="fas fa-list-check"></i> ${step.description || 'Complete this step'}`;
  }
}

function updateStepStatus(stepIndex, status, message = '') {
  const stepElement = document.getElementById(`step-${stepIndex}`);
  if (!stepElement) return;
  
  // Remove previous status classes
  stepElement.classList.remove('active', 'completed', 'error');
  
  // Add new status class
  stepElement.classList.add(status);
  
  // Update status text
  const statusElement = stepElement.querySelector('.step-status');
  statusElement.textContent = message || status;
}

function executeWorkflow(workflow) {
  if (isExecuting) return;
  
  isExecuting = true;
  currentWorkflow = workflow;
  
  // Update UI
  startWorkflow.style.display = 'none';
  stopWorkflow.style.display = 'flex';
  captureSection.style.display = 'none';
  
  // Send workflow to content script with retry logic
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    console.log("FlowPilot: Executing workflow:", workflow);
    
    // First, try to ping the content script to see if it's ready
    chrome.tabs.sendMessage(tabs[0].id, { type: "ping" }, (response) => {
      if (chrome.runtime.lastError) {
        console.log("FlowPilot: Content script not ready, injecting it...");
        
        // Inject the content script if it's not loaded
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ['content/content.js']
        }, () => {
          if (chrome.runtime.lastError) {
            console.error("FlowPilot: Error injecting content script:", chrome.runtime.lastError);
            
            // Show user-friendly error message
            alert(`FlowPilot cannot access this page: ${chrome.runtime.lastError.message}\n\nPlease try on a different page or check if the extension has permission to access this site.`);
            
            stopWorkflowExecution();
            return;
          }
          
          // Wait a moment for the script to load, then send the workflow
          setTimeout(() => {
            sendWorkflowToContentScript(tabs[0].id, workflow);
          }, 500);
        });
      } else {
        // Content script is ready, send the workflow
        sendWorkflowToContentScript(tabs[0].id, workflow);
      }
    });
  });
}

function sendWorkflowToContentScript(tabId, workflow) {
  // Add timeout to prevent hanging
  const timeoutId = setTimeout(() => {
    console.error("FlowPilot: Workflow send timeout");
    stopWorkflowExecution();
  }, 15000); // 15 second timeout
  
  // First, ensure content script is ready
  ensureContentScriptReady(tabId, () => {
    // Double-check content script is still ready before sending workflow
    chrome.tabs.sendMessage(tabId, { type: "ping" }, (pingResponse) => {
      if (chrome.runtime.lastError) {
        console.error("FlowPilot: Content script lost connection, re-injecting...");
        // Re-inject and try again
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content/content.js']
        }, () => {
          if (chrome.runtime.lastError) {
            console.error("FlowPilot: Re-injection failed:", chrome.runtime.lastError);
            stopWorkflowExecution();
            return;
          }
          
          // Wait a moment and try sending workflow
          setTimeout(() => {
            sendWorkflowWithRetry(tabId, workflow, timeoutId);
          }, 1000);
        });
      } else {
        // Content script is ready, send workflow
        sendWorkflowWithRetry(tabId, workflow, timeoutId);
      }
    });
  });
}

function sendWorkflowWithRetry(tabId, workflow, timeoutId) {
  chrome.tabs.sendMessage(tabId, { 
    type: "executeWorkflow", 
    data: workflow 
  }, (response) => {
    clearTimeout(timeoutId);
    
    if (chrome.runtime.lastError) {
      console.error("FlowPilot: Error sending workflow:", chrome.runtime.lastError);
      
      // Try one more time with a fresh ping
      console.log("FlowPilot: Attempting final retry...");
      chrome.tabs.sendMessage(tabId, { type: "ping" }, (finalPingResponse) => {
        if (chrome.runtime.lastError) {
          console.error("FlowPilot: Final retry failed - content script not responding");
          stopWorkflowExecution();
        } else {
          // Content script is responding, try workflow again
          chrome.tabs.sendMessage(tabId, { 
            type: "executeWorkflow", 
            data: workflow 
          }, (finalResponse) => {
            if (chrome.runtime.lastError) {
              console.error("FlowPilot: Final workflow send failed:", chrome.runtime.lastError);
              stopWorkflowExecution();
            } else {
              console.log("FlowPilot: Workflow sent successfully on final retry");
              if (finalResponse && finalResponse.status) {
                console.log("FlowPilot: Content script response:", finalResponse);
              }
            }
          });
        }
      });
    } else {
      console.log("FlowPilot: Workflow sent successfully");
      if (response && response.status) {
        console.log("FlowPilot: Content script response:", response);
        if (response.status === "error") {
          console.error("FlowPilot: Content script reported error:", response.error);
          stopWorkflowExecution();
        }
      }
    }
  });
}

function ensureContentScriptReady(tabId, callback) {
  // First check if content script is already ready
  chrome.tabs.sendMessage(tabId, { type: "ping" }, (response) => {
    if (chrome.runtime.lastError) {
      console.log("FlowPilot: Content script not ready, injecting...");
      
      // Inject content script
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content/content.js']
      }, () => {
        if (chrome.runtime.lastError) {
          console.error("FlowPilot: Content script injection failed:", chrome.runtime.lastError);
          stopWorkflowExecution();
          return;
        }
        
        // Wait for script to load and verify it's ready
        let attempts = 0;
        const maxAttempts = 5;
        
        const checkReady = () => {
          attempts++;
          chrome.tabs.sendMessage(tabId, { type: "ping" }, (pingResponse) => {
            if (chrome.runtime.lastError) {
              if (attempts < maxAttempts) {
                console.log(`FlowPilot: Content script not ready yet, attempt ${attempts}/${maxAttempts}`);
                setTimeout(checkReady, 500);
              } else {
                console.error("FlowPilot: Content script failed to initialize after multiple attempts");
                stopWorkflowExecution();
              }
            } else {
              console.log("FlowPilot: Content script ready after injection");
              callback();
            }
          });
        };
        
        // Start checking after a short delay
        setTimeout(checkReady, 200);
      });
    } else {
      console.log("FlowPilot: Content script already ready");
      callback();
    }
  });
}

function stopWorkflowExecution() {
  isExecuting = false;
  
  // Update UI
  startWorkflow.style.display = 'flex';
  stopWorkflow.style.display = 'none';
  captureSection.style.display = 'flex';
  
  // Send stop message to content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: "stopWorkflow" });
  });
  
  // Reset all steps to ready state
  const stepElements = document.querySelectorAll('.step-item');
  stepElements.forEach(step => {
    step.classList.remove('active', 'completed', 'error');
    const statusElement = step.querySelector('.step-status');
    statusElement.textContent = 'Ready';
  });
}

// Clean up AI session
function cleanupAISession() {
  if (aiSession) {
    console.log("FlowPilot: Cleaning up AI session");
    aiSession.destroy();
    aiSession = null;
    isAISessionReady = false;
  }
}

function clearWorkflowState() {
  console.log("FlowPilot: Clearing workflow state due to tab change");
  
  // Reset workflow state
  currentWorkflow = null;
  isExecuting = false;
  
  // Hide workflow steps
  workflowSteps.style.display = 'none';
  
  // Show capture section
  captureSection.style.display = 'flex';
  
  // Clear question input
  questionInput.value = '';
  
  // Reset any status displays
  screenshotStatus.style.display = 'none';
  
  // Stop any ongoing workflow execution
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "stopWorkflow" });
    }
  });
}

function hideWorkflowStatus() {
  if (workflowStatus) {
    workflowStatus.style.display = 'none';
  }
}

function showGenericResponse(question, url) {
  const siteName = url.includes('mail.google.com') ? 'Gmail' : 
                   url.includes('github.com') ? 'GitHub' : 
                   url.includes('docs.google.com') ? 'Google Docs' : 
                   'this site';
  
  alert(`I understand you want to "${question}" on ${siteName}.\n\nI don't have specific steps for this task yet, but I can help you record a workflow for future use!\n\nClick "Start Capture" to record your own steps.`);
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === "recordingStopped") {
      isRecording = false;
      // updateCaptureButton(); // Removed as capture button is hidden during workflow
    }
    if (message.type === "workflowCompleted") {
      hideWorkflowStatus();
      isExecuting = false;
      if (startWorkflow) startWorkflow.style.display = 'flex';
      if (stopWorkflow) stopWorkflow.style.display = 'none';
      if (captureSection) captureSection.style.display = 'flex';
    }
    if (message.type === "workflowError") {
      hideWorkflowStatus();
      isExecuting = false;
      if (startWorkflow) startWorkflow.style.display = 'flex';
      if (stopWorkflow) stopWorkflow.style.display = 'none';
      if (captureSection) captureSection.style.display = 'flex';
      console.error("FlowPilot: Workflow execution error:", message.error);
    }
    if (message.type === "stepUpdate") {
      updateStepStatus(message.stepIndex, message.status, message.message);
    }
    if (message.type === "stepStarted") {
      updateStepStatus(message.stepIndex, 'active', message.message || 'Executing...');
    }
    if (message.type === "stepCompleted") {
      updateStepStatus(message.stepIndex, 'completed', message.message || 'Completed');
    }
    if (message.type === "stepError") {
      updateStepStatus(message.stepIndex, 'error', message.message || 'Error');
    }
  } catch (error) {
    console.error("FlowPilot: Error in message handler:", error);
  }
});
