let isRecording = false;

// Get DOM elements
const captureButton = document.getElementById("captureButton");
const questionInput = document.getElementById("questionInput");
const askButton = document.getElementById("askButton");

// Initialize UI
updateCaptureButton();

// Capture button functionality
captureButton.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// Ask button functionality
askButton.addEventListener("click", async () => {
  const question = questionInput.value.trim();
  if (question) {
    // Request AI permissions if needed
    try {
      await requestAIPermissions();
      await handleQuestion(question);
    } catch (error) {
      console.error("FlowPilot: Permission request failed:", error);
      // Continue without AI
      await handleQuestion(question);
    }
  }
});

// Enter key support for input
questionInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    const question = questionInput.value.trim();
    if (question) {
      handleQuestion(question);
    }
  }
});

function startRecording() {
  isRecording = true;
  updateCaptureButton();
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: "startRecording" });
  });
  
  console.log("FlowPilot: Recording started");
}

function stopRecording() {
  isRecording = false;
  updateCaptureButton();
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: "stopRecording" });
  });
  
  console.log("FlowPilot: Recording stopped");
}

function updateCaptureButton() {
  const buttonText = captureButton.querySelector("span");
  const buttonIcon = captureButton.querySelector(".capture-icon");
  
  if (isRecording) {
    captureButton.classList.add("recording");
    buttonText.textContent = "Stop Capture";
    buttonIcon.innerHTML = '<i class="fas fa-stop"></i>';
  } else {
    captureButton.classList.remove("recording");
    buttonText.textContent = "Start Capture";
    buttonIcon.innerHTML = '<i class="fas fa-play"></i>';
  }
}

async function handleQuestion(question) {
  console.log("User asked:", question);
  
  // Show screenshot status
  const statusElement = document.getElementById('screenshotStatus');
  statusElement.style.display = 'flex';
  
  // Get current tab and capture screenshot
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const currentUrl = tabs[0].url;
    
    // Capture screenshot and HTML for analysis
    captureScreenshotAndHTML(tabs[0].id, async (screenshotData, htmlData) => {
      // Hide status
      statusElement.style.display = 'none';
      
      const siteInfo = detectSiteFromScreenshot(screenshotData, currentUrl);
      console.log("FlowPilot: Detected site info:", siteInfo);
      console.log("FlowPilot: HTML data length:", htmlData ? htmlData.length : 0);
      
      try {
        // Get AI-generated workflow steps
        const aiSteps = await getAIWorkflowSteps(question, siteInfo, screenshotData, currentUrl, htmlData);
        console.log("FlowPilot: AI generated steps:", aiSteps);
        
        // Get stored workflow steps
        const storedSteps = getWorkflowStepsFromScreenshot(question, siteInfo, screenshotData);
        console.log("FlowPilot: Stored steps:", storedSteps);
        
        // Combine AI and stored workflows
        const combinedSteps = combineWorkflows(aiSteps, storedSteps, question);
        
        if (combinedSteps.length > 0) {
          showWorkflowSteps(question, combinedSteps);
        } else {
          showGenericResponse(question, siteInfo);
        }
      } catch (error) {
        console.error("FlowPilot: AI analysis failed:", error);
        // Fallback to stored workflows
        const steps = getWorkflowStepsFromScreenshot(question, siteInfo, screenshotData);
        if (steps.length > 0) {
          showWorkflowSteps(question, steps);
        } else {
          showGenericResponse(question, siteInfo);
        }
      }
    });
  });
  
  // Clear the input
  questionInput.value = "";
}

function captureScreenshot(tabId, callback) {
  chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
    if (chrome.runtime.lastError) {
      console.error("FlowPilot: Screenshot error:", chrome.runtime.lastError);
      callback(null);
    } else {
      console.log("FlowPilot: Screenshot captured successfully");
      callback(dataUrl);
    }
  });
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
    
    // Get HTML from content script
    chrome.tabs.sendMessage(tabId, { type: "getHTML" }, (htmlData) => {
      if (chrome.runtime.lastError) {
        console.error("FlowPilot: HTML extraction error:", chrome.runtime.lastError);
        callback(screenshotData, null);
      } else {
        console.log("FlowPilot: HTML extracted successfully, length:", htmlData ? htmlData.length : 0);
        callback(screenshotData, htmlData);
      }
    });
  });
}

function detectSiteFromScreenshot(screenshotData, url) {
  // Basic URL-based detection first
  let siteInfo = detectSite(url);
  
  if (screenshotData) {
    // Enhanced detection based on visual elements
    // This would ideally use AI/ML, but for now we'll use basic heuristics
    
    // Create an image element to analyze the screenshot
    const img = new Image();
    img.onload = function() {
      console.log("FlowPilot: Screenshot dimensions:", img.width, "x", img.height);
      
      // Basic visual analysis (this is where AI would be integrated)
      if (url.includes('mail.google.com')) {
        siteInfo = { 
          name: 'Gmail', 
          type: 'email',
          hasComposeButton: true,
          hasInbox: true,
          screenshot: screenshotData
        };
      }
    };
    img.src = screenshotData;
  }
  
  return siteInfo;
}

function detectSite(url) {
  if (url.includes('mail.google.com')) {
    return { name: 'Gmail', type: 'email' };
  } else if (url.includes('docs.google.com')) {
    return { name: 'Google Docs', type: 'document' };
  } else if (url.includes('calendar.google.com')) {
    return { name: 'Google Calendar', type: 'calendar' };
  } else if (url.includes('github.com')) {
    return { name: 'GitHub', type: 'development' };
  } else if (url.includes('slack.com')) {
    return { name: 'Slack', type: 'communication' };
  } else if (url.includes('trello.com')) {
    return { name: 'Trello', type: 'project_management' };
  } else {
    return { name: 'Unknown Site', type: 'general' };
  }
}

function getWorkflowStepsFromScreenshot(question, siteInfo, screenshotData) {
  const lowerQuestion = question.toLowerCase();
  
  // Enhanced workflow generation based on screenshot analysis
  if (siteInfo.name === 'Gmail') {
    if (lowerQuestion.includes('compose') || lowerQuestion.includes('write') || lowerQuestion.includes('send email')) {
      return [
        { action: 'analyze', description: 'Analyzing Gmail interface for compose button' },
        { action: 'look', selector: 'button, [role="button"], [gh="cm"]', description: 'Looking for the Compose button' },
        { action: 'click', selector: '[gh="cm"]', description: 'Click the Compose button' },
        { action: 'wait', duration: 3000, description: 'Wait for compose window to open' },
        { action: 'analyze', description: 'Analyzing compose window for input fields' },
        { action: 'look', selector: 'input[name="to"], input[aria-label*="To"]', description: 'Looking for recipient field' },
        { action: 'type', selector: 'input[name="to"]', text: 'test@example.com', description: 'Enter recipient email address' },
        { action: 'wait', duration: 1000, description: 'Wait a moment' },
        { action: 'look', selector: 'input[name="subjectbox"], input[aria-label*="Subject"]', description: 'Looking for subject field' },
        { action: 'type', selector: 'input[name="subjectbox"]', text: 'Test Email', description: 'Enter email subject' }
      ];
    }
  }
  
  // Test workflow for any site
  if (lowerQuestion.includes('test') || lowerQuestion.includes('debug')) {
    return [
      { action: 'analyze', description: 'Analyzing page screenshot for interactive elements' },
      { action: 'look', selector: 'button, [role="button"]', description: 'Looking for buttons on the page' },
      { action: 'wait', duration: 2000, description: 'Wait 2 seconds' },
      { action: 'look', selector: 'input, textarea', description: 'Looking for input fields' }
    ];
  }
  
  // Generic workflows for other sites
  if (lowerQuestion.includes('create') || lowerQuestion.includes('new')) {
    return [
      { action: 'analyze', description: 'Analyzing page for create/new functionality' },
      { action: 'look', selector: 'button, [role="button"]', description: 'Looking for create/new buttons' },
      { action: 'click', selector: 'button:contains("Create"), button:contains("New"), [aria-label*="Create"], [aria-label*="New"]', description: 'Click create or new button' }
    ];
  }
  
  return [];
}

// AI Permission Management
async function requestAIPermissions() {
  try {
    // Check if AI permissions are already granted
    const hasPermission = await chrome.permissions.contains({
      permissions: ['ai']
    });
    
    if (hasPermission) {
      console.log("FlowPilot: AI permissions already granted");
      return true;
    }
    
    // Request AI permissions
    const granted = await chrome.permissions.request({
      permissions: ['ai']
    });
    
    if (granted) {
      console.log("FlowPilot: AI permissions granted");
      return true;
    } else {
      console.log("FlowPilot: AI permissions denied");
      return false;
    }
  } catch (error) {
    console.error("FlowPilot: Error requesting AI permissions:", error);
    return false;
  }
}

// AI Integration Functions
async function getAIWorkflowSteps(question, siteInfo, screenshotData, currentUrl, htmlData) {
  try {
    // Check if AI is available
    if (!chrome.ai || !chrome.ai.languageModel) {
      console.log("FlowPilot: AI not available, using fallback");
      return [];
    }

    // Create AI model with system prompt
    const model = await chrome.ai.languageModel.create({
      systemPrompt: `You are FlowPilot, an expert at analyzing web interfaces and creating step-by-step workflows. 

Your job is to analyze both screenshots and HTML structure of web pages to provide detailed, actionable workflow steps for user questions.

You should:
1. Analyze the visual elements in the screenshot to understand the UI
2. Use the HTML structure to find precise CSS selectors
3. Identify interactive elements (buttons, inputs, links) with their exact selectors
4. Create step-by-step workflows with reliable selectors
5. Prioritize selector reliability: id > aria-label > data-* > class > tag
6. Include appropriate wait times for dynamic content
7. Provide clear descriptions for each step

SELECTOR PRIORITY (use in this order):
1. Unique IDs: #elementId
2. Aria labels: [aria-label="exact text"]
3. Data attributes: [data-testid="value"]
4. Specific classes: .class-name
5. Role attributes: [role="button"]
6. Tag + attributes: input[type="email"]
7. Generic tags: button, input

Return your response as a JSON array of workflow steps with this format:
[
  {
    "action": "click|type|wait|look|analyze",
    "selector": "CSS selector for the element",
    "description": "Human-readable description of what to do",
    "text": "Text to type (for type actions)",
    "duration": 1000 (for wait actions)
  }
]

Focus on being practical and specific. Use the HTML to create selectors that are reliable and won't break.`
    });

    // Create the prompt with context
    const prompt = createAIPrompt(question, siteInfo, currentUrl, screenshotData, htmlData);
    
    // Get AI response
    const response = await model.prompt(prompt);
    console.log("FlowPilot: AI response:", response);
    
    // Parse the response
    return parseAIResponse(response);
    
  } catch (error) {
    console.error("FlowPilot: AI model error:", error);
    return [];
  }
}

function createAIPrompt(question, siteInfo, currentUrl, screenshotData, htmlData) {
  // Truncate HTML if too long to avoid token limits
  const maxHtmlLength = 50000; // Adjust based on model limits
  const truncatedHtml = htmlData && htmlData.length > maxHtmlLength 
    ? htmlData.substring(0, maxHtmlLength) + '... [HTML truncated]'
    : htmlData;

  return `Analyze this web page and create a workflow for the user's question.

CONTEXT:
- Website: ${siteInfo.name} (${siteInfo.type})
- URL: ${currentUrl}
- User Question: "${question}"
- Page Title: ${document.title}

SCREENSHOT DATA: ${screenshotData ? 'Screenshot captured' : 'No screenshot available'}

HTML STRUCTURE:
${truncatedHtml || 'No HTML available'}

Please analyze both the visual screenshot and the HTML structure to provide a step-by-step workflow. Use the HTML to:
1. Find the exact CSS selectors for interactive elements
2. Identify unique attributes (id, class, aria-label, data-*)
3. Understand the DOM structure and relationships
4. Create reliable selectors that won't break

Focus on:
1. Finding the right elements to interact with using precise CSS selectors
2. Using the most reliable selectors (id > aria-label > class > tag)
3. Including appropriate wait times for dynamic content
4. Making the workflow clear and actionable

Return only the JSON array of workflow steps.`;
}

function parseAIResponse(response) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // If no JSON found, try to parse the entire response
    return JSON.parse(response);
  } catch (error) {
    console.error("FlowPilot: Failed to parse AI response:", error);
    return [];
  }
}

function combineWorkflows(aiSteps, storedSteps, question) {
  // If AI provided steps, use them as primary
  if (aiSteps && aiSteps.length > 0) {
    console.log("FlowPilot: Using AI-generated workflow");
    return aiSteps;
  }
  
  // Fallback to stored steps
  if (storedSteps && storedSteps.length > 0) {
    console.log("FlowPilot: Using stored workflow");
    return storedSteps;
  }
  
  // If neither available, create a generic workflow
  return createGenericWorkflow(question);
}

function createGenericWorkflow(question) {
  return [
    { action: 'analyze', description: 'Analyzing page for relevant elements' },
    { action: 'look', selector: 'button, [role="button"], input, textarea', description: 'Looking for interactive elements' },
    { action: 'wait', duration: 2000, description: 'Analyzing page structure' }
  ];
}

// Legacy function for backward compatibility
function getWorkflowSteps(question, siteInfo) {
  return getWorkflowStepsFromScreenshot(question, siteInfo, null);
}

function showWorkflowSteps(question, steps) {
  console.log("FlowPilot: Showing workflow steps:", steps);
  let message = `Here's how to "${question}" on ${detectSite(window.location.href).name}:\n\n`;
  
  steps.forEach((step, index) => {
    message += `${index + 1}. ${step.description}\n`;
  });
  
  message += `\nWould you like me to guide you through these steps?`;
  
  console.log("FlowPilot: Showing workflow steps:", steps);
  
  if (confirm(message)) {
    // Send steps to content script for execution
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      console.log("FlowPilot: Sending workflow to tab:", tabs[0].id);
      chrome.tabs.sendMessage(tabs[0].id, { 
        type: "executeWorkflow", 
        data: { question, steps } 
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("FlowPilot: Error sending message:", chrome.runtime.lastError);
        } else {
          console.log("FlowPilot: Message sent successfully");
        }
      });
    });
  }
}

function showGenericResponse(question, siteInfo) {
  alert(`I understand you want to "${question}" on ${siteInfo.name}.\n\nI don't have specific steps for this task yet, but I can help you record a workflow for future use!\n\nClick "Start Capture" to record your own steps.`);
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "recordingStopped") {
    isRecording = false;
    updateCaptureButton();
  }
});
