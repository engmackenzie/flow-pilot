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
