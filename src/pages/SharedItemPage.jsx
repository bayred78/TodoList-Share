import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getSharedItem } from '../services/shareService';
import { LABEL_COLORS } from '../constants/colors';
import './SharedItemPage.css';

function formatDate(ts) {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
}

function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function handleFileDownload(url, fileName) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('다운로드 실패');
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
    } catch {
        alert('파일 다운로드에 실패했습니다.');
    }
}

export default function SharedItemPage() {
    const { shareId } = useParams();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [enlargedImage, setEnlargedImage] = useState(null);

    useEffect(() => {
        async function load() {
            try {
                const data = await getSharedItem(shareId);
                if (data) {
                    setItem(data);
                } else {
                    setError(true);
                }
            } catch (e) {
                console.error('공유 아이템 로드 실패:', e);
                setError(true);
            }
            setLoading(false);
        }
        load();
    }, [shareId]);

    // 로딩
    if (loading) {
        return (
            <div className="shared-page">
                <div className="shared-header">
                    <span className="shared-header-icon">✅</span>
                    <span>TodoList Share</span>
                </div>
                <div className="shared-loading">
                    <div className="spinner spinner-lg"></div>
                </div>
            </div>
        );
    }

    // 에러 / 삭제됨
    if (error || !item) {
        return (
            <div className="shared-page">
                <div className="shared-header">
                    <span className="shared-header-icon">✅</span>
                    <span>TodoList Share</span>
                </div>
                <div className="shared-error">
                    <div className="shared-error-icon">🔗</div>
                    <div className="shared-error-title">공유 링크를 찾을 수 없습니다</div>
                    <div className="shared-error-desc">
                        이 공유 링크는 취소되었거나 더 이상 유효하지 않습니다.
                    </div>
                </div>
                <PromoBanner />
            </div>
        );
    }

    const colorInfo = item.color ? LABEL_COLORS.find(c => c.id === item.color) : null;

    return (
        <div className="shared-page">
            {/* 헤더 */}
            <div className="shared-header">
                <span className="shared-header-icon">✅</span>
                <span>TodoList Share</span>
            </div>

            {/* 스냅샷 안내 */}
            <div className="shared-snapshot-notice">
                📸 이 내용은 공유 시점({formatDate(item.sharedAt)})의 스냅샷입니다. 원본 수정은 반영되지 않습니다.
            </div>

            {/* 콘텐츠 카드 */}
            <div className="shared-card">
                {/* 제목 + 메타 */}
                <div className="shared-title-section">
                    <h1 className="shared-title">{item.title || '(제목 없음)'}</h1>
                    <div className="shared-meta-row">
                        {item.checked && (
                            <span className="shared-meta-badge checked">✅ 완료</span>
                        )}
                        {item.dueDate && (
                            <span className="shared-meta-badge due">
                                ⏰ {formatDate(item.dueDate)}
                            </span>
                        )}
                        {colorInfo && (
                            <span className="shared-meta-badge color-badge" style={{ backgroundColor: colorInfo.hex }}>
                                🏅 {colorInfo.name}
                            </span>
                        )}
                        {(item.labels || []).map(l => (
                            <span key={l} className="shared-meta-badge label-badge">{l}</span>
                        ))}
                    </div>
                </div>

                {/* 본문 */}
                <div className="shared-content">
                    {(item.contentBlocks || []).map((block, idx) => {
                        if (block.type === 'text' && block.text?.trim()) {
                            return (
                                <div key={block.id || idx} className="shared-text-block">
                                    {block.text}
                                </div>
                            );
                        }
                        if (block.type === 'image' && block.url) {
                            return (
                                <div key={block.id || idx} className="shared-image-block" onClick={() => setEnlargedImage(block.url)}>
                                    <img src={block.url} alt="첨부 이미지" loading="lazy"
                                        style={block.width && block.width !== '100%' ? { width: block.width, maxWidth: '100%' } : undefined} />
                                </div>
                            );
                        }
                        if (block.type === 'file' && block.url) {
                            return (
                                <div key={block.id || idx} className="shared-file-block" onClick={() => handleFileDownload(block.url, block.name || '파일')} style={{ cursor: 'pointer' }}>
                                    <span className="shared-file-icon">📎</span>
                                    <div className="shared-file-info">
                                        <div className="shared-file-name">{block.name || '파일'}</div>
                                        {block.size && <div className="shared-file-size">{formatFileSize(block.size)}</div>}
                                    </div>
                                    <span className="shared-file-download">다운로드 ↓</span>
                                </div>
                            );
                        }
                        return null;
                    })}
                    {(!item.contentBlocks || item.contentBlocks.every(b => !((b.type === 'text' && b.text?.trim()) || b.type === 'image' || b.type === 'file'))) && (
                        <div className="shared-text-block" style={{ color: 'var(--color-text-muted)' }}>(내용 없음)</div>
                    )}
                </div>

                {/* 공유 정보 */}
                <div className="shared-info">
                    <span>📤 공유자: {item.sharedByName || '알 수 없음'}</span>
                    {item.projectName && <span>📁 프로젝트: {item.projectName}</span>}
                    <span>🕐 공유 시각: {formatDate(item.sharedAt)}</span>
                </div>
            </div>

            {/* 홍보 배너 */}
            <PromoBanner />

            {/* 이미지 확대 오버레이 */}
            {enlargedImage && (
                <div className="shared-image-overlay" onClick={() => setEnlargedImage(null)}>
                    <img src={enlargedImage} alt="확대 이미지" />
                </div>
            )}
        </div>
    );
}

function PromoBanner() {
    return (
        <div className="shared-promo">
            <div className="shared-promo-title">📱 TodoList Share</div>
            <div className="shared-promo-desc">
                팀과 함께 체크리스트를 공유하고 관리하세요!<br />
                실시간 협업, 마감일 알림, 캘린더 연동까지.
            </div>
            <a className="shared-promo-link" href="https://todolist-share.web.app" target="_blank" rel="noopener noreferrer">
                🌐 지금 시작하기
            </a>
        </div>
    );
}
