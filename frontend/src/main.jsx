import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

(function () {
    if (typeof EventTarget !== 'undefined') {
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, options) {
            const passiveEvents = ['mousewheel', 'wheel'];
            if (passiveEvents.includes(type)) {
                if (typeof options === 'boolean') {
                    options = { capture: options, passive: true };
                } else if (typeof options === 'object' && options !== null) {
                    if (typeof options.passive === 'undefined') {
                        options.passive = true;
                    }
                } else {
                    options = { passive: true };
                }
            }
            return originalAddEventListener.call(this, type, listener, options);
        };
    }
})();

createRoot(document.getElementById("root")).render(<App />);