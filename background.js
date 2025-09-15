chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "saveWorkflow") {
    chrome.storage.local.set({ workflow: msg.data }, () => {
      console.log("Workflow saved");
    });
  }

  if (msg.type === "getWorkflow") {
    chrome.storage.local.get("workflow", (res) => {
      sendResponse(res.workflow || []);
    });
    return true; // async response
  }
});

// Enable sidebar on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log("FlowPilot: Extension installed, enabling sidebar");
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    console.log("FlowPilot: Sidebar behavior set successfully");
  } catch (error) {
    console.error("FlowPilot: Error setting sidebar behavior:", error);
  }
});

// Handle extension icon click - try sidebar first, fallback to popup
chrome.action.onClicked.addListener(async (tab) => {
  console.log("FlowPilot: Extension icon clicked, trying sidebar first");
  try {
    // Check if sidePanel API is available and try to open sidebar
    if (chrome.sidePanel && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ tabId: tab.id });
      console.log("FlowPilot: Sidebar opened successfully");
      return;
    }
  } catch (error) {
    console.log("FlowPilot: Sidebar failed, will use popup fallback:", error);
  }
  
  // If we reach here, sidebar didn't work, so the popup will open automatically
  console.log("FlowPilot: Using popup fallback");
});
