let isRecording = false;
let recordedSteps = [];
let cursorOverlay;

function getUniqueSelector(el) {
  if (el.id) return `#${el.id}`;
  if (el.className) return `.${el.className.split(" ").join(".")}`;
  return el.tagName.toLowerCase();
}

// Add fake cursor overlay
function createCursor() {
  cursorOverlay = document.createElement("div");
  cursorOverlay.id = "flowpilot-cursor";
  document.body.appendChild(cursorOverlay);
}

function moveCursorTo(el) {
  const rect = el.getBoundingClientRect();
  cursorOverlay.style.left = rect.left + rect.width / 2 + "px";
  cursorOverlay.style.top = rect.top + rect.height / 2 + "px";
}

// Record mode
function startRecording() {
  isRecording = true;
  recordedSteps = [];

  document.addEventListener("click", handleClick, true);
  console.log("FlowPilot: recording started");
}

function stopRecording() {
  isRecording = false;
  document.removeEventListener("click", handleClick, true);

  chrome.runtime.sendMessage({ type: "saveWorkflow", data: recordedSteps });
  console.log("FlowPilot: recording stopped", recordedSteps);
}

function handleClick(e) {
  if (!isRecording) return;
  const selector = getUniqueSelector(e.target);
  recordedSteps.push({ type: "click", selector });
}

// Replay mode
function replayWorkflow(steps) {
  if (!cursorOverlay) createCursor();

  let i = 0;
  function nextStep() {
    if (i >= steps.length) return;
    const step = steps[i];
    const el = document.querySelector(step.selector);

    if (el) {
      el.classList.add("flowpilot-highlight");
      moveCursorTo(el);
      setTimeout(() => {
        el.classList.remove("flowpilot-highlight");
        i++;
        nextStep();
      }, 1500);
    } else {
      console.warn("Element not found:", step.selector);
      i++;
      nextStep();
    }
  }
  nextStep();
}

// Execute workflow steps
function executeWorkflow(workflowData) {
  const { question, steps } = workflowData;
  console.log("FlowPilot: Executing workflow for:", question);
  
  if (!cursorOverlay) createCursor();
  
  let currentStep = 0;
  
  function executeNextStep() {
    if (currentStep >= steps.length) {
      console.log("FlowPilot: Workflow completed");
      // Notify sidebar that workflow is complete
      chrome.runtime.sendMessage({ type: "workflowCompleted" });
      return;
    }
    
    const step = steps[currentStep];
    console.log(`FlowPilot: Step ${currentStep + 1}: ${step.description}`);
    
    // Notify sidebar that step is starting
    chrome.runtime.sendMessage({ 
      type: "stepStarted", 
      stepIndex: currentStep, 
      message: step.description 
    });
    
    switch (step.action) {
      case 'analyze':
        executeAnalyze(step);
        break;
      case 'click':
        executeClick(step);
        break;
      case 'type':
        executeType(step);
        break;
      case 'wait':
        executeWait(step);
        break;
      case 'look':
        executeLook(step);
        break;
      default:
        console.warn("FlowPilot: Unknown action:", step.action);
        console.log("FlowPilot: Available actions: analyze, click, type, wait, look");
        currentStep++;
        setTimeout(executeNextStep, 500);
    }
  }
  
  function executeAnalyze(step) {
    console.log(`FlowPilot: ${step.description}`);
    
    // Analyze the current page state
    const analysis = {
      url: window.location.href,
      title: document.title,
      buttons: document.querySelectorAll('button, [role="button"]').length,
      inputs: document.querySelectorAll('input, textarea, [contenteditable]').length,
      links: document.querySelectorAll('a').length,
      images: document.querySelectorAll('img').length,
      timestamp: new Date().toISOString()
    };
    
    console.log("FlowPilot: Page analysis:", analysis);
    
    // Highlight key elements for visual analysis
    const keyElements = document.querySelectorAll('button, [role="button"], input, textarea, [contenteditable], a[href]');
    keyElements.forEach((el, index) => {
      if (index < 10) { // Limit to first 10 elements to avoid clutter
        el.classList.add("flowpilot-highlight");
        setTimeout(() => {
          el.classList.remove("flowpilot-highlight");
        }, 2000 + (index * 200));
      }
    });
    
    // Notify step completion
    chrome.runtime.sendMessage({ 
      type: "stepCompleted", 
      stepIndex: currentStep, 
      message: "Analysis complete" 
    });
    
    // Move to next step after analysis
    currentStep++;
    setTimeout(executeNextStep, 3000);
  }
  
  function executeClick(step) {
    console.log(`FlowPilot: Looking for element with selector: ${step.selector}`);
    
    // Try multiple selector strategies
    let element = document.querySelector(step.selector);
    
    if (!element) {
      // Try alternative selectors for common Gmail elements
      const alternativeSelectors = [
        '[gh="cm"]',
        '[aria-label*="Compose"]',
        '[aria-label*="compose"]',
        '[data-tooltip*="Compose"]',
        '[data-tooltip*="compose"]',
        'div[role="button"][aria-label*="Compose"]',
        'div[role="button"][aria-label*="compose"]',
        'div.T-I.T-I-KE.L3', // Gmail compose button class
        'button[aria-label*="Compose"]',
        'button[aria-label*="compose"]'
      ];
      
      for (const selector of alternativeSelectors) {
        element = document.querySelector(selector);
        if (element) {
          console.log(`FlowPilot: Found element with alternative selector: ${selector}`);
          break;
        }
      }
    }
    
    if (element) {
      console.log("FlowPilot: Element found, highlighting and clicking");
      element.classList.add("flowpilot-highlight");
      moveCursorTo(element);
      
      setTimeout(() => {
        element.classList.remove("flowpilot-highlight");
        element.click();
        console.log("FlowPilot: Click executed");
        
        // Notify step completion
        chrome.runtime.sendMessage({ 
          type: "stepCompleted", 
          stepIndex: currentStep, 
          message: "Click executed" 
        });
        
        currentStep++;
        setTimeout(executeNextStep, 1000);
      }, 1500);
    } else {
      console.warn("FlowPilot: Element not found for click:", step.selector);
      
      // Log available buttons for debugging
      const buttons = document.querySelectorAll('button, [role="button"], div[role="button"]');
      console.log("FlowPilot: Available buttons:", buttons);
      
      // Log specific Gmail compose elements
      const gmailElements = document.querySelectorAll('[aria-label*="Compose"], [aria-label*="compose"], [data-tooltip*="Compose"]');
      console.log("FlowPilot: Gmail compose elements:", gmailElements);
      
      // Notify step error
      chrome.runtime.sendMessage({ 
        type: "stepError", 
        stepIndex: currentStep, 
        message: `Element not found for click: ${step.selector}` 
      });
      
      currentStep++;
      setTimeout(executeNextStep, 500);
    }
  }
  
  function executeType(step) {
    console.log(`FlowPilot: Looking for input element with selector: ${step.selector}`);
    
    let element = document.querySelector(step.selector);
    
    if (!element) {
      // Try alternative selectors for common input fields
      const alternatives = [
        `input[placeholder*="${step.text}"]`,
        `input[aria-label*="${step.text}"]`,
        `textarea[placeholder*="${step.text}"]`,
        `[contenteditable][aria-label*="${step.text}"]`,
        'input[type="text"]',
        'input[type="email"]',
        'textarea'
      ];
      
      for (const alt of alternatives) {
        element = document.querySelector(alt);
        if (element) {
          console.log(`FlowPilot: Found alternative input: ${alt}`);
          break;
        }
      }
    }
    
    if (element) {
      console.log("FlowPilot: Input element found, highlighting and typing");
      element.classList.add("flowpilot-highlight");
      moveCursorTo(element);
      
      setTimeout(() => {
        element.classList.remove("flowpilot-highlight");
        element.focus();
        
        // Handle different input types
        if (element.contentEditable === 'true') {
          element.textContent = step.text || '';
        } else {
          element.value = step.text || '';
        }
        
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        console.log("FlowPilot: Text typed:", step.text);
        
        // Notify step completion
        chrome.runtime.sendMessage({ 
          type: "stepCompleted", 
          stepIndex: currentStep, 
          message: `Typed: ${step.text}` 
        });
        
        currentStep++;
        setTimeout(executeNextStep, 1000);
      }, 1500);
    } else {
      console.warn("FlowPilot: Input element not found for typing:", step.selector);
      console.log("FlowPilot: Available inputs:", document.querySelectorAll('input, textarea, [contenteditable]'));
      currentStep++;
      setTimeout(executeNextStep, 500);
    }
  }
  
  function executeWait(step) {
    console.log(`FlowPilot: Waiting ${step.duration}ms`);
    setTimeout(() => {
      currentStep++;
      executeNextStep();
    }, step.duration);
  }
  
  function executeLook(step) {
    const elements = document.querySelectorAll(step.selector);
    console.log(`FlowPilot: Found ${elements.length} elements matching: ${step.selector}`);
    
    if (elements.length > 0) {
      elements.forEach((el, index) => {
        el.classList.add("flowpilot-highlight");
        setTimeout(() => {
          el.classList.remove("flowpilot-highlight");
        }, 2000 + (index * 500));
      });
    }
    
    currentStep++;
    setTimeout(executeNextStep, 3000);
  }
  
  executeNextStep();
}

// Extract HTML for AI analysis
function extractHTML() {
  // Get the main content HTML, excluding scripts and styles for cleaner analysis
  const html = document.documentElement.outerHTML;
  
  // Clean up the HTML to make it more AI-friendly
  const cleanedHtml = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  console.log("FlowPilot: HTML extracted, length:", cleanedHtml.length);
  return cleanedHtml;
}

// Listen for popup commands
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ping") {
    // Respond to ping to confirm content script is ready
    sendResponse({ status: "ready" });
    return true;
  }
  if (msg.type === "startRecording") startRecording();
  if (msg.type === "stopRecording") stopRecording();
  if (msg.type === "replayWorkflow") {
    chrome.runtime.sendMessage({ type: "getWorkflow" }, (workflow) => {
      if (workflow) replayWorkflow(workflow);
    });
  }
  if (msg.type === "executeWorkflow") {
    console.log("FlowPilot: Content script received executeWorkflow message");
    try {
      executeWorkflow(msg.data);
      // Send response back to confirm receipt
      sendResponse({ status: "workflow_started", stepCount: msg.data.steps ? msg.data.steps.length : 0 });
    } catch (error) {
      console.error("FlowPilot: Error executing workflow:", error);
      sendResponse({ status: "error", error: error.message });
    }
    return true; // Indicate we will send a response asynchronously
  }
  if (msg.type === "stopWorkflow") {
    stopWorkflow();
  }
  if (msg.type === "getHTML") {
    const htmlData = extractHTML();
    sendResponse(htmlData);
  }
});
