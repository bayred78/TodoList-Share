import { useRef, useState, useEffect } from 'react';

/**
 * 고정 헤더 + 동적 spacer 래퍼 컴포넌트
 * - position: fixed 헤더의 실제 높이를 ResizeObserver로 측정
 * - 동일 높이의 spacer를 자동 삽입하여 콘텐츠가 가려지지 않도록 함
 */
export default function PageHeader({ children }) {
    const ref = useRef(null);
    const [height, setHeight] = useState(56);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const update = () => {
            setHeight(el.getBoundingClientRect().height);
        };

        update();

        const observer = new ResizeObserver(update);
        observer.observe(el);

        return () => observer.disconnect();
    }, []);

    return (
        <>
            <div className="page-header" ref={ref}>
                {children}
            </div>
            <div style={{ height, flexShrink: 0 }} />
        </>
    );
}
