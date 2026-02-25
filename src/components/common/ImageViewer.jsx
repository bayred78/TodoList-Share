import React, { useState, useEffect, useRef, useCallback } from 'react';
import { downloadFile } from '../../services/storageService';

/**
 * 이미지 뷰어 모달 컴포넌트
 * - 확대/축소 (버튼 + 더블탭 + 핀치)
 * - focal point 기반 줌 (확대: 터치/클릭 위치, 축소: 화면 중앙)
 * - 드래그 패닝
 * - ESC 키 닫기
 * - 다운로드 버튼
 */
export default function ImageViewer({ url, onClose }) {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const lastDist = useRef(0);
    const pinchCenter = useRef({ x: 0, y: 0 });
    const containerRef = useRef(null);

    // ESC 키로 닫기
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    // 줌 초기화
    const resetView = useCallback(() => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    }, []);

    /**
     * focal point 기반 줌
     * @param {Function|number} updater - scale 업데이터
     * @param {number} fx - focal point X (화면 좌표)
     * @param {number} fy - focal point Y (화면 좌표)
     */
    const zoomAt = useCallback((updater, fx, fy) => {
        setScale((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            const clamped = Math.max(1, Math.min(4, next));

            if (clamped <= 1) {
                setPosition({ x: 0, y: 0 });
            } else {
                // 화면 중심을 (0,0)으로 하는 로컬(상대) 좌표로 변환
                const cx = window.innerWidth / 2;
                const cy = window.innerHeight / 2;
                const rx = fx - cx;
                const ry = fy - cy;

                setPosition((pos) => ({
                    x: rx - (rx - pos.x) * (clamped / prev),
                    y: ry - (ry - pos.y) * (clamped / prev),
                }));
            }
            return clamped;
        });
    }, []);

    // 화면 중앙 좌표 계산
    const getScreenCenter = useCallback(() => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }, []);

    // 더블 클릭/탭 → 줌 토글 (터치 위치 기준 확대)
    const handleDoubleClick = useCallback((e) => {
        if (scale === 1) {
            const fx = e.clientX || e.touches?.[0]?.clientX || window.innerWidth / 2;
            const fy = e.clientY || e.touches?.[0]?.clientY || window.innerHeight / 2;
            zoomAt(2, fx, fy);
        } else {
            resetView();
        }
    }, [scale, resetView, zoomAt]);

    // ===== 마우스 드래그 =====
    const handleMouseDown = (e) => {
        if (scale <= 1) return;
        setDragging(true);
        dragStart.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseMove = (e) => {
        if (!dragging) return;
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        dragStart.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseUp = () => setDragging(false);

    // ===== 터치 제스처 (핀치 줌 + 드래그) =====
    const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastDist.current = Math.sqrt(dx * dx + dy * dy);
            // 핀치 중심점 기록
            pinchCenter.current = {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
            };
        } else if (e.touches.length === 1 && scale > 1) {
            setDragging(true);
            dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    };
    const handleTouchMove = (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // 핀치 중심점 업데이트
            const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            pinchCenter.current = { x: cx, y: cy };

            if (lastDist.current > 0) {
                const delta = dist / lastDist.current;
                zoomAt((s) => s * delta, cx, cy);
            }
            lastDist.current = dist;
        } else if (e.touches.length === 1 && dragging) {
            const dx = e.touches[0].clientX - dragStart.current.x;
            const dy = e.touches[0].clientY - dragStart.current.y;
            setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    };
    const handleTouchEnd = (e) => {
        if (e.touches.length < 2) lastDist.current = 0;
        if (e.touches.length === 0) setDragging(false);
    };

    // 버튼 확대: 화면 중앙 기준
    const handleZoomIn = useCallback(() => {
        const c = getScreenCenter();
        zoomAt((s) => s + 0.5, c.x, c.y);
    }, [zoomAt, getScreenCenter]);

    // 버튼 축소: 화면 중앙 기준
    const handleZoomOut = useCallback(() => {
        const c = getScreenCenter();
        zoomAt((s) => s - 0.5, c.x, c.y);
    }, [zoomAt, getScreenCenter]);

    return (
        <div className="image-viewer-overlay" onClick={onClose}>
            <div className="image-viewer-toolbar" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} title="닫기">✕</button>
                <div className="image-viewer-actions">
                    <button onClick={handleZoomOut} title="축소">−</button>
                    <button onClick={resetView} title="원본 크기">1:1</button>
                    <button onClick={handleZoomIn} title="확대">+</button>
                    <button onClick={() => downloadFile(url, `image_${Date.now()}.jpg`)} title="다운로드">⬇</button>
                </div>
            </div>
            <div
                ref={containerRef}
                className="image-viewer-container"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <img
                    src={url}
                    alt="이미지 뷰어"
                    style={{
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                        transition: dragging ? 'none' : 'transform var(--transition-fast)',
                    }}
                    onDoubleClick={handleDoubleClick}
                    draggable={false}
                />
            </div>
        </div>
    );
}
