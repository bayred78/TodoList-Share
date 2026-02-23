import React from 'react';

export default function Modal({ isOpen, onClose, title, children, footer, hideHeader }) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                {!hideHeader && (
                    <div className="modal-header">
                        <h2>{title}</h2>
                        <button className="modal-close" onClick={onClose}>×</button>
                    </div>
                )}
                <div className="modal-body">
                    {children}
                </div>
                {footer && (
                    <div className="modal-footer">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
