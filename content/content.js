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

// Listen for popup commands
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "startRecording") startRecording();
  if (msg.type === "stopRecording") stopRecording();
  if (msg.type === "replayWorkflow") {
    chrome.runtime.sendMessage({ type: "getWorkflow" }, (workflow) => {
      if (workflow) replayWorkflow(workflow);
    });
  }
});
