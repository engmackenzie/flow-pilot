export function getWorkflowPrompt(question, url, screenshotData, htmlData, storedWorkflows) {
  // Truncate HTML if too long
  const maxHtmlLength = 50000;
  const truncatedHtml = htmlData && htmlData.length > maxHtmlLength 
    ? htmlData.substring(0, maxHtmlLength) + '... [HTML truncated]'
    : htmlData;

  return `Analyze this web page and create a workflow for the user's question.

CONTEXT:
- User Question: "${question}"
- Current URL: ${url}
- Page Title: ${document.title}
- Screenshot: ${screenshotData ? 'Screenshot captured' : 'No screenshot available'}

HTML STRUCTURE:
${truncatedHtml || 'No HTML available'}

STORED WORKFLOWS (for reference):
${storedWorkflows.length > 0 ? JSON.stringify(storedWorkflows, null, 2) : 'No stored workflows available'}

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

Return only the JSON object with the workflow steps.`;
}