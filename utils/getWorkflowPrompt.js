export function getWorkflowPrompt(question, url, screenshotData, interactiveElementsData, storedWorkflows) {
  // Parse interactive elements data if it's a string
  let interactiveElements = interactiveElementsData;
  if (typeof interactiveElementsData === 'string') {
    try {
      interactiveElements = JSON.parse(interactiveElementsData);
    } catch (error) {
      console.error('FlowPilot: Error parsing interactive elements data:', error);
      interactiveElements = { elements: [] };
    }
  }

  return `Analyze this web page and create a workflow for the user's question.

CONTEXT:
- User Question: "${question}"
- Current URL: ${url}
- Page Type: ${interactiveElements.pageContext?.pageType || 'unknown'}
- Page Title: ${interactiveElements.pageContext?.title || 'Unknown'}
- Screenshot: ${screenshotData ? 'Screenshot captured' : 'No screenshot available'}

INTERACTIVE ELEMENTS (${interactiveElements.elements?.length || 0} elements found):
${JSON.stringify(interactiveElements, null, 2)}

STORED WORKFLOWS (for reference):
${storedWorkflows.length > 0 ? JSON.stringify(storedWorkflows, null, 2) : 'No stored workflows available'}

Please analyze the interactive elements and create a step-by-step workflow. Each element includes:
- tag: HTML tag name
- id: Element ID (if available)
- className: CSS classes
- text: Visible text content
- attributes: Essential attributes (aria-label, role, data-*)
- selectors: Pre-generated CSS selectors (use the most reliable one)
- position: Element position and visibility
- context: Parent elements for better understanding

Focus on:
1. Finding the right elements to interact with using the provided selectors
2. Using the most reliable selectors (id > aria-label > data-testid > class > tag)
3. Including appropriate wait times for dynamic content
4. Making the workflow clear and actionable
5. Using the element text and attributes to understand what each element does

Return only the JSON object with the workflow steps.`;
}