/**
 * Interface Draggable Service
 * @description Provides smooth pointer-based drag and drop mechanics for UI components. Persists layout state if enabled by the user.
 */
export class DraggableService {
    /**
     * Binds drag events to a target element and its designated drag handle.
     * @param {HTMLElement} panel - The main element to be moved.
     * @param {HTMLElement} handle - The area within the panel that triggers the drag.
     * @param {boolean} persistPosition - Whether to save the location to Chrome storage.
     */
    static init(panel, handle, persistPosition = false) {
        if (!panel || !handle) return;

        let isDragging = false;
        let startX, startY, initialX, initialY;

        handle.style.cursor = 'grab';

        if (persistPosition) {
            chrome.storage.local.get(['malPanelCoords'], (res) => {
                if (res.malPanelCoords) {
                    panel.style.bottom = 'auto';
                    panel.style.right = 'auto';
                    panel.style.left = `${res.malPanelCoords.x}px`;
                    panel.style.top = `${res.malPanelCoords.y}px`;
                }
            });
        }

        handle.addEventListener('mousedown', dragStart);

        function dragStart(e) {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            
            isDragging = true;
            handle.style.cursor = 'grabbing';
            
            const rect = panel.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            
            startX = e.clientX;
            startY = e.clientY;

            panel.style.bottom = 'auto';
            panel.style.right = 'auto';
            panel.style.left = `${initialX}px`;
            panel.style.top = `${initialY}px`;
            
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);
            
            e.preventDefault(); 
        }

        function drag(e) {
            if (!isDragging) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            let newX = initialX + dx;
            let newY = initialY + dy;

            newX = Math.max(0, Math.min(newX, window.innerWidth - panel.offsetWidth));
            newY = Math.max(0, Math.min(newY, window.innerHeight - panel.offsetHeight));

            panel.style.left = `${newX}px`;
            panel.style.top = `${newY}px`;
        }

        function dragEnd() {
            isDragging = false;
            handle.style.cursor = 'grab';
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', dragEnd);

            if (persistPosition) {
                const rect = panel.getBoundingClientRect();
                chrome.storage.local.set({ 
                    malPanelCoords: { x: rect.left, y: rect.top } 
                });
            } else {
                chrome.storage.local.remove('malPanelCoords');
            }
        }
    }
}