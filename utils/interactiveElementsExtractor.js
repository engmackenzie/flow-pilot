/**
 * Interactive Elements Extractor for FlowPilot
 * Extracts only interactive elements with their essential attributes for AI analysis
 */

/**
 * Extract interactive elements from HTML
 * @param {string} html - Raw HTML string
 * @param {string} url - Current page URL for context
 * @returns {string} - JSON string of interactive elements
 */
export function extractInteractiveElements(html, url = '') {
  if (!html || typeof html !== 'string') {
    return '[]';
  }

  console.log(`FlowPilot: Extracting interactive elements from HTML (${html.length} chars)`);
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const interactiveElements = [];
    
    // Define selectors for interactive elements
    const interactiveSelectors = [
      'button',
      'input',
      'select',
      'textarea',
      'a[href]',
      '[role="button"]',
      'role="button"',
      '[role="link"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="option"]',
      '[onclick]',
      '[onmousedown]',
      '[onmouseup]',
      'form',
      '[data-testid]',
      '[data-cy]',
      '[data-test]',
      '[aria-label]',
      '[aria-labelledby]',
      '[aria-describedby]',
      'label',
      'option',
      'summary', // For details/summary elements
      '[contenteditable="true"]'
    ];
    
    // Find all interactive elements
    const elements = doc.querySelectorAll(interactiveSelectors.join(', '));
    
    elements.forEach((element, index) => {
      const elementData = extractElementData(element, index);
      if (elementData) {
        interactiveElements.push(elementData);
      }
    });
    
    // Add form context if elements are inside forms
    const forms = doc.querySelectorAll('form');
    forms.forEach((form, formIndex) => {
      const formData = extractFormData(form, formIndex);
      if (formData) {
        interactiveElements.push(formData);
      }
    });
    
    // Add page context
    const pageContext = extractPageContext(doc, url);
    
    const result = {
      pageContext,
      elements: interactiveElements,
      totalElements: interactiveElements.length,
      extractionTime: new Date().toISOString()
    };
    
    const jsonString = JSON.stringify(result, null, 2);
    console.log(`FlowPilot: Extracted ${interactiveElements.length} interactive elements (${jsonString.length} chars)`);
    
    return jsonString;
    
  } catch (error) {
    console.error('FlowPilot: Error extracting interactive elements:', error);
    return '[]';
  }
}

/**
 * Extract data from a single interactive element
 */
function extractElementData(element, index) {
  const tagName = element.tagName.toLowerCase();
  
  // Skip if element is hidden or not visible
  if (isElementHidden(element)) {
    return null;
  }
  
  const elementData = {
    index,
    tag: tagName,
    id: element.id || null,
    className: element.className || null,
    text: getElementText(element),
    attributes: extractEssentialAttributes(element),
    selectors: generateSelectors(element),
    position: getElementPosition(element),
    context: getElementContext(element)
  };
  
  // Add specific data based on element type
  if (tagName === 'input') {
    elementData.inputType = element.type || 'text';
    elementData.placeholder = element.placeholder || null;
    elementData.value = element.value || null;
    elementData.required = element.required || false;
  } else if (tagName === 'select') {
    elementData.options = extractSelectOptions(element);
  } else if (tagName === 'a') {
    elementData.href = element.href || null;
  }
  
  return elementData;
}

/**
 * Check if element is hidden
 */
function isElementHidden(element) {
  const style = window.getComputedStyle ? window.getComputedStyle(element) : element.style;
  return style.display === 'none' || 
         style.visibility === 'hidden' || 
         element.hidden ||
         element.offsetParent === null;
}

/**
 * Get element text content (truncated)
 */
function getElementText(element) {
  const text = element.textContent?.trim() || '';
  return text.length > 100 ? text.substring(0, 100) + '...' : text;
}

/**
 * Extract essential attributes
 */
function extractEssentialAttributes(element) {
  const essentialAttrs = [
    'id', 'class', 'name', 'type', 'value', 'placeholder',
    'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-expanded',
    'role', 'data-testid', 'data-cy', 'data-test', 'data-id',
    'title', 'alt', 'href', 'src', 'for', 'tabindex'
  ];
  
  const attributes = {};
  essentialAttrs.forEach(attr => {
    if (element.hasAttribute(attr)) {
      attributes[attr] = element.getAttribute(attr);
    }
  });
  
  return attributes;
}

/**
 * Generate multiple selector strategies for the element
 */
function generateSelectors(element) {
  const selectors = [];
  
  // ID selector (highest priority)
  if (element.id) {
    selectors.push(`#${element.id}`);
  }
  
  // Aria-label selector
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    selectors.push(`[aria-label="${ariaLabel}"]`);
  }
  
  // Data attributes
  const dataTestId = element.getAttribute('data-testid');
  if (dataTestId) {
    selectors.push(`[data-testid="${dataTestId}"]`);
  }
  
  // Class selector (if unique enough)
  if (element.className) {
    const classes = element.className.split(' ').filter(c => c.length > 0);
    if (classes.length === 1) {
      selectors.push(`.${classes[0]}`);
    } else if (classes.length > 1) {
      // Try combination of classes
      selectors.push(`.${classes.join('.')}`);
    }
  }
  
  // Tag + attribute combinations
  const tagName = element.tagName.toLowerCase();
  if (element.name) {
    selectors.push(`${tagName}[name="${element.name}"]`);
  }
  if (element.type) {
    selectors.push(`${tagName}[type="${element.type}"]`);
  }
  
  // Role selector
  const role = element.getAttribute('role');
  if (role) {
    selectors.push(`[role="${role}"]`);
  }
  
  // Text content selector (for buttons, links)
  const text = element.textContent?.trim();
  if (text && text.length < 50 && (tagName === 'button' || tagName === 'a')) {
    selectors.push(`${tagName}:contains("${text}")`);
  }
  
  return selectors;
}

/**
 * Get element position in the DOM
 */
function getElementPosition(element) {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    visible: rect.width > 0 && rect.height > 0
  };
}

/**
 * Get element context (parent elements)
 */
function getElementContext(element) {
  const context = [];
  let parent = element.parentElement;
  let depth = 0;
  
  while (parent && depth < 3) {
    const parentInfo = {
      tag: parent.tagName.toLowerCase(),
      id: parent.id || null,
      className: parent.className || null,
      role: parent.getAttribute('role') || null
    };
    context.unshift(parentInfo);
    parent = parent.parentElement;
    depth++;
  }
  
  return context;
}

/**
 * Extract form data
 */
function extractFormData(form, formIndex) {
  const formData = {
    index: `form-${formIndex}`,
    tag: 'form',
    id: form.id || null,
    className: form.className || null,
    action: form.action || null,
    method: form.method || 'get',
    attributes: extractEssentialAttributes(form),
    selectors: generateSelectors(form),
    context: getElementContext(form)
  };
  
  return formData;
}

/**
 * Extract select options
 */
function extractSelectOptions(selectElement) {
  const options = [];
  const optionElements = selectElement.querySelectorAll('option');
  
  optionElements.forEach((option, index) => {
    options.push({
      index,
      value: option.value || null,
      text: option.textContent?.trim() || '',
      selected: option.selected || false
    });
  });
  
  return options;
}

/**
 * Extract page context
 */
function extractPageContext(doc, url) {
  const title = doc.querySelector('title')?.textContent || '';
  const h1 = doc.querySelector('h1')?.textContent || '';
  const h2 = doc.querySelector('h2')?.textContent || '';
  
  // Detect page type
  let pageType = 'unknown';
  if (url.includes('mail.google.com')) pageType = 'gmail';
  else if (url.includes('github.com')) pageType = 'github';
  else if (url.includes('docs.google.com')) pageType = 'google-docs';
  else if (url.includes('youtube.com')) pageType = 'youtube';
  else if (url.includes('facebook.com')) pageType = 'facebook';
  else if (url.includes('twitter.com')) pageType = 'twitter';
  
  return {
    url,
    title,
    h1,
    h2,
    pageType,
    timestamp: new Date().toISOString()
  };
}

/**
 * Get compression statistics
 */
export function getExtractionStats(originalSize, extractedSize) {
  const reduction = Math.round((1 - extractedSize / originalSize) * 100);
  const compressionRatio = Math.round(originalSize / extractedSize * 10) / 10;
  
  return {
    originalSize,
    extractedSize,
    reduction: `${reduction}%`,
    compressionRatio: `${compressionRatio}x`,
    saved: originalSize - extractedSize
  };
}
