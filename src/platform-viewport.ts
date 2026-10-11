/**
 * Platform viewport size manager
 * Handles visual viewport for mobile browsers and Telegram stable height
 */

// CSS variable names for viewport dimensions
const CSS_VAR_APP_WIDTH = '--app-viewport-width';
const CSS_VAR_APP_HEIGHT = '--app-viewport-height';

/**
 * Interface for testability - abstract window-like object
 */
export interface ViewportWindow {
  innerWidth: number;
  innerHeight: number;
  visualViewport: {
    width: number;
    height: number;
    addEventListener(type: 'resize', listener: () => void): void;
    removeEventListener(type: 'resize', listener: () => void): void;
  } | null;
  addEventListener(type: 'resize', listener: () => void): void;
  removeEventListener(type: 'resize', listener: () => void): void;
}

/**
 * Interface for testability - abstract document.documentElement.style
 */
export interface RootStyle {
  setProperty(name: string, value: string): void;
}

/**
 * Get current viewport dimensions
 * Uses visualViewport when available, fallback to innerWidth/innerHeight
 * @param win - Window-like object (for DI)
 * @returns {width, height} in pixels
 */
export function getViewportDimensions(win: ViewportWindow): { width: number; height: number } {
  // Use Visual Viewport API when available (modern mobile browsers)
  if (win.visualViewport) {
    return {
      width: win.visualViewport.width,
      height: win.visualViewport.height,
    };
  }
  // Fallback for environments without Visual Viewport API
  return {
    width: win.innerWidth,
    height: win.innerHeight,
  };
}

/**
 * Update CSS variables for window dimensions
 * @param rootStyle - Document root style object
 * @param width - Window width in pixels
 * @param height - Window height in pixels
 */
export function updateViewportVariables(
  rootStyle: RootStyle,
  width: number,
  height: number
): void {
  rootStyle.setProperty(CSS_VAR_APP_WIDTH, `${width}px`);
  rootStyle.setProperty(CSS_VAR_APP_HEIGHT, `${height}px`);
}

/**
 * Sync viewport size to CSS variables
 * @param win - Window-like object (for DI)
 * @param rootStyle - Document root style object
 */
export function syncViewportSize(
  win: ViewportWindow,
  rootStyle: RootStyle
): void {
  const dims = getViewportDimensions(win);
  updateViewportVariables(rootStyle, dims.width, dims.height);
}

/**
 * Create viewport size manager with cleanup/disposer
 * Dependency-injected for testability
 * @param win - Window-like object
 * @param rootStyle - Document root style object
 * @returns {dispose} function to remove all listeners
 */
export function createViewportSizeManager(
  win: ViewportWindow,
  rootStyle: RootStyle
): { dispose(): void } {
  // Sync immediately on creation for first layout
  syncViewportSize(win, rootStyle);

  let disposed = false;

  const onVisualResize = () => {
    syncViewportSize(win, rootStyle);
  };

  const onWindowResize = () => {
    syncViewportSize(win, rootStyle);
  };

  // Capture visualViewport reference for cleanup
  const vv = win.visualViewport;

  // Listen to visualViewport resize events if available
  if (vv) {
    vv.addEventListener('resize', onVisualResize);
  }

  // Also listen to window resize as backup
  win.addEventListener('resize', onWindowResize);

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;

      // Remove listeners with captured reference
      if (vv) {
        vv.removeEventListener('resize', onVisualResize);
      }
      win.removeEventListener('resize', onWindowResize);
    },
  };
}

// Export CSS variable names for tests
export { CSS_VAR_APP_WIDTH, CSS_VAR_APP_HEIGHT };
