import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useToastStore from '../stores/toastStore';
import { subscribeToProject, canWrite, canAdmin, getUserRole, getRoleLabel, leaveProject, changeMemberRole, removeMember, deleteProject, saveProjectCalendarId, getProjectCalendarId, addProjectLabel, removeProjectLabel, updateMemberDisplayName } from '../services/projectService';
import { getProjectLimits, getUserLimits, getUserPlan, getEffectivePlan, LIMITS } from '../services/subscriptionService';
import UpgradeModal from '../components/common/UpgradeModal';
import { subscribeToAllItems, addTodoItem, updateTodoItem, deleteTodoItem, toggleCheck, createRepeatItem, updateMemberCheck, updateCalendarSync, restoreTodoItem, permanentDeleteItem, getCachedItems, deltaFetchItems } from '../services/todoService';
import { Timestamp } from 'firebase/firestore';
import { sendMessage, subscribeToRecentMessages, loadOlderMessages, updateLastRead, getCachedMessages, setCachedMessages, sendDirectMessage } from '../services/chatService';
import { inviteUser } from '../services/invitationService';
import { findUserByNicknameOrEmail } from '../services/userService';
import { getUserProfile } from '../services/authService';
import { addEventToCalendar, removeEventFromCalendar, shareCalendarWithUser, unshareCalendarWithUser, checkEventExists, getCalendarAclEmails, hasCalendarToken, getCalendarList } from '../services/calendarService';
import { uploadChatImage, uploadItemImage, uploadItemFile, downloadFile, deleteStorageFile } from '../services/storageService';
import { formatFileSize } from '../utils/imageUtils';
import { subscribeToFavoriteItems, addFavoriteItem, removeFavoriteItem, subscribeToFavoriteFriends, addFavoriteFriend, removeFavoriteFriend } from '../services/favoriteService';
import { exportItemsToCsv, parseCsv } from '../services/csvService';
import Modal from '../components/common/Modal';
import ImageViewer from '../components/common/ImageViewer';
import { LABEL_COLORS, COLOR_MAP, normalizeColorId } from '../constants/colors';
import CalendarView from '../components/CalendarView';
import './ProjectPage.css';


// 인라인 달력 컴포넌트
function InlineCalendar({ initialDate, onConfirm, onCancel, calendarList, selectedCalendar, onCalendarChange, loadingCalendars }) {
    const [viewDate, setViewDate] = React.useState(initialDate || new Date());
    const [showYearMonth, setShowYearMonth] = React.useState(false);
    const [selectedDate, setSelectedDate] = React.useState(null);
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
    const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

    const days = [];
    for (let i = firstDay - 1; i >= 0; i--) {
        days.push({ day: prevMonthDays - i, outside: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        days.push({ day: d, outside: false, dateStr, isToday: dateStr === todayStr });
    }
    while (days.length < 42) {
        days.push({ day: days.length - firstDay - daysInMonth + 1, outside: true });
    }

    const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
    const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

    const handleMonthSelect = (m) => {
        setViewDate(new Date(year, m, 1));
        setShowYearMonth(false);
    };

    const handleYearChange = (delta) => {
        setViewDate(new Date(year + delta, month, 1));
    };

    return (
        <div className="inline-calendar">
            <div className="inline-calendar-header">
                {!showYearMonth && (
                    <button type="button" className="inline-calendar-nav" onClick={prevMonth}>◀</button>
                )}
                <button
                    type="button"
                    className="inline-calendar-title-btn"
                    onClick={() => setShowYearMonth(!showYearMonth)}
                    title="년/월 빠른 선택"
                >
                    {year}년 {month + 1}월 {showYearMonth ? '▲' : '▼'}
                </button>
                {!showYearMonth && (
                    <button type="button" className="inline-calendar-nav" onClick={nextMonth}>▶</button>
                )}
            </div>

            {showYearMonth ? (
                <div className="inline-calendar-ym-panel">
                    <div className="inline-calendar-year-row">
                        <button type="button" className="inline-calendar-nav" onClick={() => handleYearChange(-1)}>◀</button>
                        <span className="inline-calendar-year-label">{year}년</span>
                        <button type="button" className="inline-calendar-nav" onClick={() => handleYearChange(1)}>▶</button>
                    </div>
                    <div className="inline-calendar-month-grid">
                        {monthNames.map((name, i) => (
                            <button
                                key={i}
                                type="button"
                                className={`inline-calendar-month-btn${i === month ? ' active' : ''}${i === today.getMonth() && year === today.getFullYear() ? ' current' : ''}`}
                                onClick={() => handleMonthSelect(i)}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                    <button type="button" className="inline-calendar-today-btn" onClick={() => { setViewDate(new Date()); setShowYearMonth(false); }}>
                        오늘로 이동
                    </button>
                </div>
            ) : (
                <>
                    <div className="inline-calendar-weekdays">
                        {weekDays.map(d => <div key={d} className={`inline-calendar-weekday${d === '일' ? ' sun' : d === '토' ? ' sat' : ''}`}>{d}</div>)}
                    </div>
                    <div className="inline-calendar-grid">
                        {days.map((d, i) => (
                            <button
                                key={i}
                                type="button"
                                className={`inline-calendar-day${d.outside ? ' outside' : ''}${d.isToday ? ' today' : ''}${d.dateStr === selectedDate ? ' selected' : ''}`}
                                disabled={d.outside}
                                onClick={() => !d.outside && setSelectedDate(d.dateStr)}
                            >
                                {d.day}
                            </button>
                        ))}
                    </div>
                </>
            )}

            <div className="inline-calendar-actions">
                {calendarList !== undefined && (
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {loadingCalendars ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', fontSize: 11, color: 'var(--color-text-muted)' }}>
                                <span className="spinner" style={{ width: 14, height: 14 }}></span>
                                <span>캘린더 로딩...</span>
                            </div>
                        ) : (
                            <select
                                className="input-field"
                                style={{ width: '100%', fontSize: 11, padding: 'var(--spacing-xs) var(--spacing-sm)', height: 32 }}
                                value={selectedCalendar || 'primary'}
                                onChange={(e) => onCalendarChange && onCalendarChange(e.target.value)}
                            >
                                <option value="primary">기본 캘린더</option>
                                {(calendarList || []).map(cal => (
                                    <option key={cal.id} value={cal.id}>{cal.summary || cal.id}</option>
                                ))}
                            </select>
                        )}
                    </div>
                )}
                <button type="button" className="btn btn-secondary" onClick={onCancel}>취소</button>
                <button type="button" className="btn btn-primary" onClick={() => selectedDate && onConfirm(selectedDate)} disabled={!selectedDate}>확인</button>
            </div>
        </div>
    );
}

// 텍스트에서 URL을 감지하여 클릭 가능한 링크로 렌더링
function renderContentWithLinks(text) {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    const handleLinkClick = (e, url) => {
        e.preventDefault();
        if (window.confirm(`이 링크를 열겠습니까?\n\n${url}`)) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    return parts.map((part, i) => {
        if (urlRegex.test(part)) {
            urlRegex.lastIndex = 0;
            return (
                <a
                    key={i}
                    href={part}
                    onClick={(e) => handleLinkClick(e, part)}
                    className="content-link"
                >
                    {part}
                </a>
            );
        }
        // 줄바꿈 처리
        return part.split('\n').map((line, j, arr) => (
            <React.Fragment key={`${i}-${j}`}>
                {line}
                {j < arr.length - 1 && <br />}
            </React.Fragment>
        ));
    });
}

// 마감일 기반 8단계 우선순위 자동 계산
function getDuePriority(dueDate) {
    if (!dueDate) return { level: 0, icon: '', color: '' };
    const now = new Date();
    const due = dueDate?.toDate ? dueDate.toDate() : new Date(dueDate);
    const h = (due - now) / 36e5;
    if (h <= 0) return { level: 8, icon: '🔴🔴', color: '#ef4444' };
    if (h <= 1) return { level: 7, icon: '🔴', color: '#ef4444' };
    if (h <= 6) return { level: 6, icon: '🟠', color: '#f97316' };
    if (h <= 24) return { level: 5, icon: '🟡', color: '#eab308' };
    if (h <= 72) return { level: 4, icon: '🟢', color: '#22c55e' };
    if (h <= 168) return { level: 3, icon: '🔵', color: '#3b82f6' };
    if (h <= 336) return { level: 2, icon: '🟣', color: '#a855f7' };
    return { level: 1, icon: '⚪', color: '#9ca3af' };
}

// Firestore Timestamp → datetime-local 문자열
function toLocalDatetime(ts) {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function ProjectPage() {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { profile, refreshProfile } = useAuthStore();
    const addToast = useToastStore((s) => s.addToast);

    const [project, setProject] = useState(null);
    const [items, setItems] = useState([]);
    const [activeTab, setActiveTab] = useState('checklist');
    const [pageViewMode, setPageViewMode] = useState(() => localStorage.getItem('pageViewMode') || 'card');
    const [refreshKey, setRefreshKey] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const [favoriteItems, setFavoriteItems] = useState([]);
    const favoriteItemSet = useMemo(() => new Set(favoriteItems.map(f => `${f.projectId}_${f.itemId}`)), [favoriteItems]);

    const VIEW_MODES = ['card', 'grid', 'list', 'detail'];
    const VIEW_MODE_ICONS = { card: '🃏', grid: '🔲', list: '📋', detail: '📄' };
    const VIEW_MODE_LABELS = { card: '카드', grid: '2열', list: '리스트', detail: '상세' };

    const togglePageViewMode = () => {
        const currentIndex = VIEW_MODES.indexOf(pageViewMode);
        const nextMode = VIEW_MODES[(currentIndex + 1) % VIEW_MODES.length];
        setPageViewMode(nextMode);
        localStorage.setItem('pageViewMode', nextMode);
    };
    const [showAddModal, setShowAddModal] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [editItemOriginal, setEditItemOriginal] = useState(null);
    const [isEditingContent, setIsEditingContent] = useState(false);
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);
    const [conflictData, setConflictData] = useState(null); // { serverData, myData }

    // 새 아이템 폼
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [newColor, setNewColor] = useState(null);
    const [newDueDate, setNewDueDate] = useState('');
    const [newLabels, setNewLabels] = useState([]);
    const [newRepeatType, setNewRepeatType] = useState('none');
    const [editOptionSheet, setEditOptionSheet] = useState(null); // 'color'|'dueDate'|'label'|'repeat'|'file'|null
    const [addOptionSheet, setAddOptionSheet] = useState(null); // 'color'|'dueDate'|'label'|'repeat'|'file'|null
    const [newImages, setNewImages] = useState([]); // { file: File, preview: string }[]
    const [newFiles, setNewFiles] = useState([]);   // File[]
    const addImageRef = React.useRef(null);
    const addDocRef = React.useRef(null);
    const [showDueHelp, setShowDueHelp] = useState(false);
    // DM 모달 상태
    const [showChatDm, setShowChatDm] = useState(false);
    const [chatDmRecipient, setChatDmRecipient] = useState('');
    const [chatDmSearchResult, setChatDmSearchResult] = useState(null);
    const [chatDmSearching, setChatDmSearching] = useState(false);
    const [chatDmMessage, setChatDmMessage] = useState('');
    const [chatDmSending, setChatDmSending] = useState(false);
    const [chatFavFriends, setChatFavFriends] = useState([]);
    const [dueDisplayMode, setDueDisplayMode] = useState(() => localStorage.getItem('dueDisplayMode') || 'date'); // 'date' | 'remaining'
    const [filters, setFilters] = useState({
        colors: [], due: [], labels: [], repeat: null, attachment: null, status: null, members: [],
    });

    // 마감일 포맷 함수
    const formatDueText = (dueDate) => {
        if (!dueDate) return null;
        const due = dueDate.toDate ? dueDate.toDate() : new Date(dueDate);
        const now = new Date();
        const diff = due - now;
        const diffMs = Math.abs(diff);
        const isOverdue = diff < 0;

        if (dueDisplayMode === 'remaining') {
            // 남은 시간 표시 (간결 형식)
            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            if (isOverdue) {
                if (days > 0) return `${days}일 초과`;
                return `${hours}:${String(mins).padStart(2, '0')} 초과`;
            }
            if (days > 0) return `${days}일 남음`;
            return `${hours}:${String(mins).padStart(2, '0')} 남음`;
        } else {
            // 날짜 표시: 1일 이상 남으면 월.일, 미만이면 HH:MM
            if (!isOverdue && diff < 24 * 60 * 60 * 1000) {
                const hh = String(due.getHours()).padStart(2, '0');
                const mm = String(due.getMinutes()).padStart(2, '0');
                return `${hh}:${mm}`;
            }
            return `${due.getMonth() + 1}.${due.getDate()}`;
        }
    };
    const [showFilterPanel, setShowFilterPanel] = useState(false);
    const [showMemberFilter, setShowMemberFilter] = useState(false);
    const [showCalendarFilter, setShowCalendarFilter] = useState(false);
    const [showCsvMenu, setShowCsvMenu] = useState(false);
    const [csvImportConflicts, setCsvImportConflicts] = useState(null);
    const csvFileRef = React.useRef(null);

    // 채팅
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [chatImageFile, setChatImageFile] = useState(null);
    const [chatImagePreview, setChatImagePreview] = useState('');
    const [chatUploading, setChatUploading] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const chatEndRef = React.useRef(null);
    const chatContainerRef = React.useRef(null);
    const chatFileInputRef = React.useRef(null);

    // 체크리스트 첨부파일
    const [itemImageUploading, setItemImageUploading] = useState(false);
    const [itemFileUploading, setItemFileUploading] = useState(false);
    const editItemImageRef = React.useRef(null);
    const editItemDocRef = React.useRef(null);

    // 휴지통
    const [deletedItems, setDeletedItems] = useState([]);
    const [trashSelectMode, setTrashSelectMode] = useState(false);
    const [trashSelected, setTrashSelected] = useState([]);

    // 초대 폼
    const [inviteNickname, setInviteNickname] = useState('');
    const [inviteRole, setInviteRole] = useState('editor');
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [viewerImage, setViewerImage] = useState(null);
    const [upgradeReason, setUpgradeReason] = useState('');
    const [inviting, setInviting] = useState(false);
    const [newLabel, setNewLabel] = useState('');

    // 활동명 시스템
    const [showDisplayNamePrompt, setShowDisplayNamePrompt] = useState(false);
    const [myDisplayNameInput, setMyDisplayNameInput] = useState('');

    // 반복 체크리스트 확인 모달
    const [showRepeatConfirm, setShowRepeatConfirm] = useState(false);
    const [repeatConfirmItem, setRepeatConfirmItem] = useState(null);

    // 구성원 체크 드롭다운
    const [showMemberCheckDropdown, setShowMemberCheckDropdown] = useState(false);

    // 캘린더 설정
    const [calendarId, setCalendarId] = useState('');
    const [savingCalendar, setSavingCalendar] = useState(false);
    const [calendarIdEditing, setCalendarIdEditing] = useState(false);
    const [teamCalendarName, setTeamCalendarName] = useState('');
    const [showCalendarHelp, setShowCalendarHelp] = useState(false);
    const [calendarSharedMembers, setCalendarSharedMembers] = useState({}); // { uid: true/false }
    const [sharingCalendar, setSharingCalendar] = useState({}); // { uid: true } - 로딩 상태
    const [calendarShareRequested, setCalendarShareRequested] = useState({}); // { uid: true } - 공유 요청 상태
    const [requestingShare, setRequestingShare] = useState(false);

    // 날짜 선택 모달
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [pickerCalendarId, setPickerCalendarId] = useState(() => localStorage.getItem('lastSelectedCalendarId') || 'primary');
    const [pickerCalendarList, setPickerCalendarList] = useState([]);
    const [loadingPickerCalendars, setLoadingPickerCalendars] = useState(false);
    const [calendarTargetItem, setCalendarTargetItem] = useState(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [addingToCalendar, setAddingToCalendar] = useState(false);



    useEffect(() => {
        let isMounted = true;
        const unsub1 = subscribeToProject(projectId, setProject);

        // ① 캐시 우선 로드 — 즉시 렌더링
        const cached = getCachedItems(projectId);
        if (cached) {
            setItems(cached.active);
            setDeletedItems(cached.deleted);
        }

        // ② 실시간 구독 시작
        let itemUnsub = subscribeToAllItems(projectId, setItems, setDeletedItems);
        let reconnectTimer = null;

        // ③ 탭 비활성/활성 처리
        const handleVisibility = () => {
            if (document.hidden) {
                clearTimeout(reconnectTimer);
                itemUnsub();
                itemUnsub = () => { };
            } else {
                // Ⓐ 캐시 즉시 표시
                const c = getCachedItems(projectId);
                if (c) { setItems(c.active); setDeletedItems(c.deleted); }

                // Ⓑ 3초 디바운스 → delta fetch → onSnapshot 재구독
                clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(async () => {
                    if (!isMounted) return;
                    try {
                        const delta = await deltaFetchItems(projectId);
                        if (!isMounted) return;
                        if (delta) {
                            setItems(delta.active);
                            setDeletedItems(delta.deleted);
                        }
                    } catch (e) {
                        console.warn('Delta fetch failed:', e);
                    }
                    if (!isMounted) return;
                    itemUnsub = subscribeToAllItems(projectId, setItems, setDeletedItems);
                }, 3000);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            isMounted = false;
            unsub1();
            itemUnsub();
            clearTimeout(reconnectTimer);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [projectId]);

    // 즐겨찾기 구독
    useEffect(() => {
        if (!profile?.uid) return;
        const unsub = subscribeToFavoriteItems(profile.uid, setFavoriteItems);
        const unsubFriends = subscribeToFavoriteFriends(profile.uid, setChatFavFriends);
        return () => { unsub(); unsubFriends(); };
    }, [profile?.uid]);

    // 채팅 구독은 채팅 탭이 활성화된 때만 (비용 절감)
    useEffect(() => {
        if (activeTab !== 'chat') return;
        // 탭 전환 시 상태 초기화
        isLoadingOlderRef.current = false;
        setLoadingOlder(false);
        chatInitializedRef.current = false;
        justSentRef.current = false;

        // 캐시된 메시지가 있으면 먼저 표시 (구독 전 즉시 보여줌)
        const cached = getCachedMessages(projectId);
        if (cached) {
            setChatMessages(cached.messages);
            setHasMoreMessages(cached.hasMore);
        } else {
            setHasMoreMessages(true);
        }

        // 실시간 구독 시작 (캐시가 있어도 구독은 하되, 새 메시지만 반영됨)
        const unsub = subscribeToRecentMessages(projectId, 20, (recentMsgs) => {
            setChatMessages(prev => {
                // 이전에 로드한 오래된 메시지가 있으면 유지하고 최신부분만 갱신
                if (prev.length > recentMsgs.length) {
                    const olderPortion = prev.slice(0, prev.length - 20);
                    const merged = [...olderPortion, ...recentMsgs];
                    // 중복 제거
                    const seen = new Set();
                    return merged.filter(m => {
                        if (seen.has(m.id)) return false;
                        seen.add(m.id);
                        return true;
                    });
                }
                return recentMsgs;
            });
        });
        return () => unsub();
    }, [activeTab, projectId, refreshKey]);

    // 이전 메시지 로딩 중 여부 (스크롤 제어용)
    const isLoadingOlderRef = useRef(false);
    // 최초 채팅탭 진입 여부 (첫 로드 시 즉시 하단 표시)
    const chatInitializedRef = useRef(false);
    // 본인이 메시지를 보냈는지 여부 (스크롤 제어용)
    const justSentRef = useRef(false);
    // 채팅 입력 필드 ref (키보드 유지용)
    const chatInputRef = useRef(null);
    // 스크롤이 하단 근처에 있는지 여부 (상대방 메시지 수신 시 자동 스크롤 판단용)
    const isNearBottomRef = useRef(true);

    // 채팅탭 활성화 시 lastRead 업데이트
    useEffect(() => {
        if (activeTab === 'chat' && profile) {
            updateLastRead(projectId, profile.uid);
        }
    }, [activeTab, profile, projectId]);

    // 채팅 메시지 변경 시 스크롤 제어
    // 의존성: 마지막 메시지 ID → 새 메시지가 올 때만 트리거 (길이가 같아도 감지)
    const lastMsgId = chatMessages[chatMessages.length - 1]?.id;
    useEffect(() => {
        if (activeTab !== 'chat' || chatMessages.length === 0) return;
        // 이전 메시지 로딩 중이면 스크롤 하단 이동 안 함
        if (isLoadingOlderRef.current) return;

        // 최초 진입 시: 항상 최하단으로 이동
        if (!chatInitializedRef.current) {
            chatInitializedRef.current = true;
            isNearBottomRef.current = true;
            requestAnimationFrame(() => {
                chatEndRef.current?.scrollIntoView({ behavior: 'instant' });
            });
            return;
        }

        // 본인이 보낸 메시지: 항상 최하단으로 이동
        if (justSentRef.current) {
            justSentRef.current = false;
            isNearBottomRef.current = true;
            requestAnimationFrame(() => {
                chatEndRef.current?.scrollIntoView({ behavior: 'instant' });
            });
            return;
        }

        // 상대방 메시지: 하단 근처에 있을 때만 자동 스크롤
        if (isNearBottomRef.current) {
            requestAnimationFrame(() => {
                chatEndRef.current?.scrollIntoView({ behavior: 'instant' });
            });
        }
        // 하단에서 멀리 떨어져 있으면 스크롤 위치 유지 (아무것도 하지 않음)
    }, [activeTab, lastMsgId]);

    // 프로젝트의 캘린더 ID (구독/공유/이벤트 추가에 사용)
    const myCalendarId = useMemo(() => {
        if (!project) return '';
        return getProjectCalendarId(project);
    }, [project]);

    // 프로젝트 로드 시 해당 프로젝트의 캘린더 ID 로드
    useEffect(() => {
        if (project) {
            setCalendarId(getProjectCalendarId(project));
            // 캘린더 공유 상태 로드
            if (project.calendarSharedWith) {
                setCalendarSharedMembers(project.calendarSharedWith);
            }
            // 캘린더 공유 요청 상태 로드
            if (project.calendarShareRequests) {
                setCalendarShareRequested(project.calendarShareRequests);
            }
        }
    }, [project]);

    // 캘린더 자동 구독: 공유 상태가 pending이면 자동으로 내 캘린더에 추가
    useEffect(() => {
        if (!project || !profile || !myCalendarId) return;
        const sharedStatus = project.calendarSharedWith?.[profile.uid];
        if (sharedStatus === 'pending' || sharedStatus === true) {
            // pending이면 자동 구독 시도
            if (sharedStatus === 'pending') {
                (async () => {
                    try {
                        const { subscribeToCalendar } = await import('../services/calendarService');
                        await subscribeToCalendar(myCalendarId);
                        // 구독 성공 → 상태 업데이트
                        const { updateDoc, doc, serverTimestamp } = await import('firebase/firestore');
                        const { db } = await import('../services/firebase');
                        await updateDoc(doc(db, 'projects', projectId), {
                            [`calendarSharedWith.${profile.uid}`]: true,
                            [`calendarShareAccepted.${profile.uid}`]: true,
                            updatedAt: serverTimestamp(),
                        });
                    } catch (err) {
                        console.error('캘린더 자동 구독 실패:', err);
                    }
                })();
            }
        }
    }, [project, profile, myCalendarId, projectId]);

    // openSettings 쿼리 파라미터 처리 → 설정 모달 자동 열기
    useEffect(() => {
        if (searchParams.get('openSettings') === 'true' && project) {
            setShowSettingsModal(true);
            searchParams.delete('openSettings');
            setSearchParams(searchParams, { replace: true });
        }
    }, [project, searchParams]);

    // openItem 쿼리 파라미터 처리 → 체크리스트 자동 열기
    useEffect(() => {
        const openItemId = searchParams.get('openItem');
        if (openItemId && items.length > 0) {
            const targetItem = items.find(i => i.id === openItemId);
            if (targetItem) {
                const copy = { ...targetItem };
                setEditItem(copy);
                setEditItemOriginal({ ...copy });
                setShowEditModal(true);
            }
            // 다음 틱에서 쿼리 파라미터 정리 (searchParams 의존성 재실행 방지)
            setTimeout(() => {
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('openItem');
                setSearchParams(newParams, { replace: true });
            }, 0);
        }
    }, [items, searchParams]);

    const userCanWrite = useMemo(() => {
        if (!project || !profile) return false;
        return canWrite(project, profile.uid);
    }, [project, profile]);

    const userCanAdmin = useMemo(() => {
        if (!project || !profile) return false;
        return canAdmin(project, profile.uid);
    }, [project, profile]);

    const projectLimits = useMemo(() => {
        if (!project) return LIMITS.free;
        return getProjectLimits(project);
    }, [project]);

    const userLimits = useMemo(() => {
        if (!profile) return LIMITS.free;
        return getUserLimits(profile);
    }, [profile]);

    // 실효 제한: 관리자 플랜(프로젝트) OR 본인 플랜 중 넓은 쪽 적용
    // 단, 수치형(maxPages 등)은 관리자 기준, 기능 플래그는 OR
    // 실효 제한: boolean은 OR, 숫자는 Math.max(관리자, 본인) 또는 프로젝트기준
    const effectiveLimits = useMemo(() => {
        const result = {};
        const maxKeys = new Set([
            'maxItems', 'maxPages', 'chatHistory',
            'freeDueDateLimit', 'freeLabelLimit'
        ]);
        for (const key of Object.keys(LIMITS.free)) {
            const pv = projectLimits[key];
            const uv = userLimits[key];
            if (typeof pv === 'boolean') {
                result[key] = pv || uv;
            } else if (maxKeys.has(key)) {
                result[key] = Math.max(pv ?? 0, uv ?? 0);
            } else {
                result[key] = pv;  // maxMembers 등 프로젝트기준 유지
            }
        }
        return result;
    }, [projectLimits, userLimits]);

    const getMemberName = React.useCallback((uid) => {
        if (!project?.members?.[uid]) return null;
        const m = project.members[uid];
        if (project.useDisplayName) {
            return m.displayName || m.nickname || uid;
        }
        return m.nickname || uid;
    }, [project]);

    const allMemberList = useMemo(() => {
        if (!project?.members) return [];
        return Object.entries(project.members).map(([uid, m]) => ({
            uid, nickname: getMemberName(uid)
        }));
    }, [project, getMemberName]);

    const activeFilterCount = useMemo(() => {
        let c = 0;
        if (filters.colors.length > 0) c++;
        if (filters.due.length > 0) c++;
        if (filters.labels.length > 0) c++;
        if (filters.repeat) c++;
        if (filters.attachment) c++;
        if (filters.status) c++;
        if (filters.members.length > 0) c++;
        return c;
    }, [filters]);

    const filteredItems = useMemo(() => {
        let list = items.filter(i => i.type === 'checklist');
        const f = filters;

        // 색상 (카테고리 내 OR)
        if (f.colors.length > 0) {
            list = list.filter(i => {
                if (f.colors.includes('none') && !i.color) return true;
                return f.colors.includes(i.color);
            });
        }

        // 마감일 (카테고리 내 OR)
        if (f.due.length > 0) {
            const now = new Date();
            const day1 = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
            const day3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
            const day7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            const day14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
            list = list.filter(i => {
                if (!i.dueDate) return false;
                const due = i.dueDate?.toDate ? i.dueDate.toDate() : new Date(i.dueDate);
                if (isNaN(due.getTime())) return false;
                if (due < now) return f.due.includes('overdue');
                if (due <= day1) return f.due.includes('day1');
                if (due <= day3) return f.due.includes('day3');
                if (due <= day7) return f.due.includes('day7');
                if (due <= day14) return f.due.includes('day14');
                return f.due.includes('later');
            });
        }

        // 라벨 (카테고리 내 OR)
        if (f.labels.length > 0) {
            list = list.filter(i => (i.labels || []).some(l => f.labels.includes(l)));
        }

        // 반복 (단일 토글)
        if (f.repeat === 'yes') list = list.filter(i => i.repeatType && i.repeatType !== 'none');
        if (f.repeat === 'no') list = list.filter(i => !i.repeatType || i.repeatType === 'none');

        // 첨부 (이미지+파일)
        if (f.attachment === 'yes') list = list.filter(i => (i.images || []).length > 0 || (i.files || []).length > 0);
        if (f.attachment === 'image') list = list.filter(i => (i.images || []).length > 0);
        if (f.attachment === 'file') list = list.filter(i => (i.files || []).length > 0);
        if (f.attachment === 'no') list = list.filter(i => (i.images || []).length === 0 && (i.files || []).length === 0);

        // 상태 (단일 토글, 상호배타)
        if (f.status === 'checked') list = list.filter(i => i.checked);
        if (f.status === 'unchecked') list = list.filter(i => !i.checked);

        // 구성원 (다중 선택, OR 조건)
        if (f.members.length > 0) {
            list = list.filter(i => f.members.includes(i.createdBy));
        }

        // 정렬 (기존 유지)
        list.sort((a, b) => {
            // 완료된 항목은 하단으로
            if (a.checked !== b.checked) return a.checked ? 1 : -1;
            const aDue = a.dueDate?.toDate ? a.dueDate.toDate() : a.dueDate ? new Date(a.dueDate) : null;
            const bDue = b.dueDate?.toDate ? b.dueDate.toDate() : b.dueDate ? new Date(b.dueDate) : null;
            if (aDue && bDue) return aDue - bDue;
            if (aDue && !bDue) return -1;
            if (!aDue && bDue) return 1;
            return (a.order ?? 9999) - (b.order ?? 9999);
        });
        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items, JSON.stringify(filters)]);

    // 통계 데이터 (Firestore 추가 쿼리 없음 — items에서 계산)
    const statsData = useMemo(() => {
        if (activeTab !== 'stats') return null;
        const checklistItems = items.filter(i => i.type === 'checklist');
        const total = checklistItems.length;
        const checked = checklistItems.filter(i => i.checked).length;
        const unchecked = total - checked;
        const rate = total > 0 ? Math.round((checked / total) * 100) : 0;

        // 색상별
        const byColor = {};
        checklistItems.forEach(item => {
            const normalizedColor = normalizeColorId(item.color);
            const colorLabel = LABEL_COLORS.find(c => c.id === normalizedColor);
            const colorName = colorLabel ? colorLabel.name : '무순위';
            const colorHex = colorLabel ? colorLabel.hex : '#ccc';
            if (!byColor[colorName]) byColor[colorName] = { total: 0, checked: 0, hex: colorHex, colorId: normalizedColor };
            byColor[colorName].total++;
            if (item.checked) byColor[colorName].checked++;
        });

        // 구성원별
        const byMember = {};
        checklistItems.forEach(item => {
            const uid = item.createdBy || '';
            const m = getMemberName(uid) || item.createdByNickname || '알 수 없음';
            const key = uid || m; // UID 기준 그룹핑 (UID 없으면 표시명 기준)
            if (!byMember[key]) byMember[key] = { name: m, uid, created: 0, checked: 0 };
            byMember[key].created++;
            if (item.checked) byMember[key].checked++;
        });

        // 마감일 현황 (미완료만)
        const now = new Date();
        const day1End = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
        const day3End = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        const day7End = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const day14End = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        let overdue = 0, day1 = 0, day3 = 0, day7 = 0, day14 = 0, later = 0, noDue = 0;
        checklistItems.filter(i => !i.checked).forEach(item => {
            if (!item.dueDate) { noDue++; return; }
            const due = item.dueDate?.toDate ? item.dueDate.toDate() : new Date(item.dueDate);
            if (isNaN(due.getTime())) { noDue++; return; }
            if (due < now) overdue++;
            else if (due <= day1End) day1++;
            else if (due <= day3End) day3++;
            else if (due <= day7End) day7++;
            else if (due <= day14End) day14++;
            else later++;
        });

        // 라벨별
        const byLabel = {};
        checklistItems.forEach(item => {
            (item.labels || []).forEach(label => {
                if (!byLabel[label]) byLabel[label] = { total: 0, checked: 0 };
                byLabel[label].total++;
                if (item.checked) byLabel[label].checked++;
            });
        });

        const withRepeat = checklistItems.filter(i => i.repeatType && i.repeatType !== 'none').length;
        const withImage = checklistItems.filter(i => (i.images || []).length > 0).length;
        const withFile = checklistItems.filter(i => (i.files || []).length > 0).length;
        const withAttachment = checklistItems.filter(i => (i.images || []).length > 0 || (i.files || []).length > 0).length;

        return { total, checked, unchecked, rate, byColor, byMember, byLabel, overdue, day1, day3, day7, day14, later, noDue, withRepeat, withImage, withFile, withAttachment };
    }, [activeTab, items]);

    const handleStatsClick = (filterOverride) => {
        setFilters({
            colors: filterOverride.colors || [],
            due: filterOverride.due || [],
            labels: filterOverride.labels || [],
            repeat: filterOverride.repeat || null,
            attachment: filterOverride.attachment || null,
            status: filterOverride.status || null,
            members: filterOverride.members || [],
        });
        setActiveTab('checklist');
        setShowFilterPanel(false);
        setTimeout(() => window.scrollTo(0, 0), 0);
    };

    // 드래그 앤 드롭 순서 변경
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);
    const [dragOverId, setDragOverId] = useState(null);

    const handleDragStart = (e, itemId) => {
        dragItem.current = itemId;
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.style.opacity = '0.5';
    };

    const handleDragEnd = (e) => {
        e.currentTarget.style.opacity = '1';
        setDragOverId(null);
    };

    const handleDragOver = (e, itemId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dragOverItem.current = itemId;
        setDragOverId(itemId);
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        setDragOverId(null);
        if (!dragItem.current || !dragOverItem.current || dragItem.current === dragOverItem.current) return;

        const list = [...filteredItems];
        const fromIdx = list.findIndex(i => i.id === dragItem.current);
        const toIdx = list.findIndex(i => i.id === dragOverItem.current);
        if (fromIdx < 0 || toIdx < 0) return;

        const [moved] = list.splice(fromIdx, 1);
        list.splice(toIdx, 0, moved);

        // Firestore order 일괄 업데이트
        try {
            const promises = list.map((item, idx) =>
                updateTodoItem(projectId, item.id, { order: idx })
            );
            await Promise.all(promises);
        } catch (error) {
            addToast('순서 변경에 실패했습니다.', 'error');
        }

        dragItem.current = null;
        dragOverItem.current = null;
    };



    const handleAddItem = async (e) => {
        e.preventDefault();
        if (!newTitle.trim()) {
            addToast('제목을 입력해주세요.', 'warning');
            return;
        }

        // ★ 항목 수 제한 체크
        if (items.filter(i => !i.deleted).length >= effectiveLimits.maxItems) {
            setUpgradeReason('maxItems');
            setShowUpgradeModal(true);
            return;
        }
        // ★ 반복 설정 제한 (select 우회 방지)
        if (newRepeatType && newRepeatType !== 'none' && !effectiveLimits.repeat) {
            setUpgradeReason('repeat');
            setShowUpgradeModal(true);
            return;
        }
        // ★ 마감일 수량 제한
        if (newDueDate && effectiveLimits.freeDueDateLimit !== Infinity) {
            const dueDateCount = items.filter(i => !i.deleted && i.dueDate).length;
            if (dueDateCount >= effectiveLimits.freeDueDateLimit) {
                setUpgradeReason('freeDueDate');
                setShowUpgradeModal(true);
                return;
            }
        }
        // ★ 라벨 수량 제한
        if (newLabels.length > 0 && effectiveLimits.freeLabelLimit !== Infinity) {
            const labelCount = items.filter(i => !i.deleted && (i.labels || []).length > 0).length;
            if (labelCount >= effectiveLimits.freeLabelLimit) {
                setUpgradeReason('freeLabel');
                setShowUpgradeModal(true);
                return;
            }
        }
        try {
            const newItemId = await addTodoItem(projectId, {
                type: 'checklist',
                title: newTitle.trim(),
                content: newContent.trim(),
                color: newColor,
                dueDate: newDueDate ? Timestamp.fromDate(new Date(newDueDate)) : null,
                labels: newLabels,
                repeatType: newRepeatType !== 'none' ? newRepeatType : null,
                createdBy: profile.uid,
                createdByNickname: getMemberName(profile.uid) || profile.nickname,
            });
            // 첨부 파일 업로드 (생성 후 ID 확보)
            if (newImages.length > 0 || newFiles.length > 0) {
                const uploadedImages = [];
                const uploadedFiles = [];
                for (const img of newImages) {
                    try {
                        const { downloadUrl } = await uploadItemImage(projectId, newItemId, img.file);
                        uploadedImages.push(downloadUrl);
                    } catch (err) { addToast('이미지 업로드 실패: ' + img.file.name, 'error'); }
                }
                for (const f of newFiles) {
                    try {
                        const { downloadUrl, fileName, fileSize, fileType } = await uploadItemFile(projectId, newItemId, f);
                        uploadedFiles.push({ url: downloadUrl, name: fileName, size: fileSize, type: fileType });
                    } catch (err) { addToast('파일 업로드 실패: ' + f.name, 'error'); }
                }
                if (uploadedImages.length > 0 || uploadedFiles.length > 0) {
                    await updateTodoItem(projectId, newItemId, {
                        ...(uploadedImages.length > 0 ? { images: uploadedImages } : {}),
                        ...(uploadedFiles.length > 0 ? { files: uploadedFiles } : {}),
                    });
                }
                newImages.forEach(img => URL.revokeObjectURL(img.preview));
            }
            // 활동 알림 전송 (메인페이지 메세지탭에 표시)
            try {
                const { updateDoc, doc, arrayUnion } = await import('firebase/firestore');
                const { db } = await import('../services/firebase');
                await updateDoc(doc(db, 'projects', projectId), {
                    notifications: arrayUnion({
                        type: 'activity',
                        action: 'create',
                        text: `📋 "${newTitle.trim()}" 항목을 추가했습니다.`,
                        actorId: profile.uid,
                        actorName: getMemberName(profile.uid) || profile.nickname,
                        projectName: project?.name || '',
                        createdAt: new Date().toISOString(),
                        itemId: newItemId,
                    }),
                });
            } catch (e) { /* 알림 실패해도 추가는 완료 */ }
            setNewTitle('');
            setNewContent('');
            setNewColor(null);
            setNewDueDate('');
            setNewLabels([]);
            setNewRepeatType('none');
            setNewImages([]);
            setNewFiles([]);
            setShowAddModal(false);
            addToast('아이템이 추가되었습니다!', 'success');
        } catch (error) {
            addToast('아이템 추가에 실패했습니다.', 'error');
        }
    };

    const handleToggleCheck = async (item) => {
        if (!userCanWrite) return;
        try {
            const result = await toggleCheck(projectId, item.id, !item.checked, item, profile?.uid);
            // 반복 항목 체크 시 확인 모달 표시
            if (result?.isRepeat) {
                setRepeatConfirmItem(item);
                setShowRepeatConfirm(true);
            }
        } catch (error) {
            addToast('상태 변경에 실패했습니다.', 'error');
        }
    };

    const handleRepeatConfirm = async () => {
        if (!repeatConfirmItem) return;
        try {
            await createRepeatItem(projectId, repeatConfirmItem);
            addToast('반복 항목이 새로 생성되었습니다.', 'info');
        } catch (error) {
            addToast('반복 항목 생성에 실패했습니다.', 'error');
        } finally {
            setShowRepeatConfirm(false);
            setRepeatConfirmItem(null);
        }
    };

    const handleRepeatCancel = () => {
        setShowRepeatConfirm(false);
        setRepeatConfirmItem(null);
    };

    // 구성원 체크 토글
    const handleMemberCheckToggle = async (item, userId) => {
        if (!item || !userId) return;
        try {
            const currentChecks = item.memberChecks || {};
            const newChecked = !currentChecks[userId];

            // ★ 로컬 state 즉시 갱신 (UI 즉시 반영)
            const optimisticChecks = { ...currentChecks, [userId]: newChecked };
            if (editItem && editItem.id === item.id) {
                setEditItem(prev => ({ ...prev, memberChecks: optimisticChecks }));
            }

            const updatedChecks = await updateMemberCheck(projectId, item.id, userId, newChecked);

            // 모든 구성원이 체크했는지 확인
            if (updatedChecks && project?.members) {
                const memberUIDs = Object.keys(project.members);
                const allChecked = memberUIDs.every(uid => updatedChecks[uid] === true);
                if (allChecked && !item.checked) {
                    await toggleCheck(projectId, item.id, true, item, profile?.uid);
                    addToast('모든 구성원이 확인하여 자동 체크되었습니다!', 'success');
                    // 반복 항목이면 확인 모달 표시
                    if (item.repeatType && item.repeatType !== 'none') {
                        setRepeatConfirmItem(item);
                        setShowRepeatConfirm(true);
                    }
                }
            }
        } catch (error) {
            // 실패 시 원래 상태로 롤백
            if (editItem && editItem.id === item.id) {
                setEditItem(prev => ({ ...prev, memberChecks: item.memberChecks || {} }));
            }
            addToast('구성원 체크에 실패했습니다.', 'error');
        }
    };

    const handleDeleteItem = async (itemId) => {
        if (!confirm('휴지통으로 이동하시겠습니까?')) return;
        const deletedItem = items.find(i => i.id === itemId);
        try {
            await deleteTodoItem(projectId, itemId);
            // 활동 알림 전송 (메인페이지 메세지탭에 표시)
            try {
                const { updateDoc, doc, arrayUnion } = await import('firebase/firestore');
                const { db } = await import('../services/firebase');
                await updateDoc(doc(db, 'projects', projectId), {
                    notifications: arrayUnion({
                        type: 'activity',
                        action: 'delete',
                        text: `🗑️ "${deletedItem?.title || '항목'}" 을(를) 삭제했습니다.`,
                        actorId: profile.uid,
                        actorName: getMemberName(profile.uid) || profile.nickname,
                        projectName: project?.name || '',
                        createdAt: new Date().toISOString(),
                    }),
                });
            } catch (e) { /* 알림 실패해도 삭제는 완료 */ }
            addToast('휴지통으로 이동했습니다. (7일 후 영구 삭제)', 'success');
        } catch (error) {
            addToast('삭제에 실패했습니다.', 'error');
        }
    };

    // 휴지통 복원
    const handleRestoreItem = async (itemId) => {
        try {
            await restoreTodoItem(projectId, itemId);
            addToast('복원되었습니다!', 'success');
        } catch (error) {
            addToast('복원에 실패했습니다.', 'error');
        }
    };

    // 영구 삭제
    const handlePermanentDelete = async (itemId) => {
        if (!confirm('영구적으로 삭제합니다. 복원할 수 없습니다.')) return;
        try {
            await permanentDeleteItem(projectId, itemId);
            addToast('영구 삭제되었습니다.', 'success');
        } catch (error) {
            addToast('삭제에 실패했습니다.', 'error');
        }
    };

    // 휴지통 일괄 기능
    const handleRestoreSelected = async () => {
        if (trashSelected.length === 0) {
            addToast('복원할 항목을 선택해주세요.', 'warning');
            return;
        }
        if (!confirm(`${trashSelected.length}개 항목을 복원합니다.`)) return;
        try {
            for (const id of trashSelected) {
                await restoreTodoItem(projectId, id);
            }
            addToast(`${trashSelected.length}개 항목이 복원되었습니다!`, 'success');
            setTrashSelected([]);
            setTrashSelectMode(false);
        } catch (error) {
            addToast('복원 중 오류가 발생했습니다.', 'error');
        }
    };

    const handleDeleteSelected = async () => {
        if (trashSelected.length === 0) {
            addToast('삭제할 항목을 선택해주세요.', 'warning');
            return;
        }
        if (!confirm(`${trashSelected.length}개 항목을 영구 삭제합니다. 복원할 수 없습니다.`)) return;
        try {
            for (const id of trashSelected) {
                await permanentDeleteItem(projectId, id);
            }
            addToast(`${trashSelected.length}개 항목이 영구 삭제되었습니다.`, 'success');
            setTrashSelected([]);
            setTrashSelectMode(false);
        } catch (error) {
            addToast('삭제 중 오류가 발생했습니다.', 'error');
        }
    };

    // 채팅 이미지 선택
    const handleChatImageSelect = (e) => {
        // ★ 이미지 채팅은 개인 구독 기반 (Team 전용)
        if (!userLimits.imageChat) {
            setUpgradeReason('imageChat');
            setShowUpgradeModal(true);
            e.target.value = '';
            return;
        }
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            addToast('이미지 파일만 전송할 수 있습니다.', 'error');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            addToast('10MB 이하 이미지만 전송할 수 있습니다.', 'error');
            return;
        }
        setChatImageFile(file);
        const reader = new FileReader();
        reader.onload = (ev) => setChatImagePreview(ev.target.result);
        reader.readAsDataURL(file);
    };

    // 채팅 이미지 선택 취소
    const handleChatImageCancel = () => {
        setChatImageFile(null);
        setChatImagePreview('');
        if (chatFileInputRef.current) chatFileInputRef.current.value = '';
    };

    // 채팅 전송 (텍스트 + 이미지 지원)
    const handleSendMessage = async (e) => {
        e.preventDefault();
        const text = chatInput.trim();
        const hasImage = !!chatImageFile;
        if (!text && !hasImage) return;

        setChatInput('');
        chatInputRef.current?.focus();

        try {
            justSentRef.current = true;

            // 이미지가 있으면 먼저 업로드 후 이미지 메시지 전송
            if (hasImage) {
                setChatUploading(true);
                const { downloadUrl, fileName } = await uploadChatImage(projectId, chatImageFile);
                await sendMessage(projectId, {
                    text: '',
                    senderId: profile.uid,
                    senderNickname: getMemberName(profile.uid) || profile.nickname,
                    type: 'image',
                    mediaUrl: downloadUrl,
                    mediaName: fileName,
                });
                handleChatImageCancel();
                setChatUploading(false);
            }

            // 텍스트가 있으면 텍스트 메시지 전송
            if (text) {
                await sendMessage(projectId, {
                    text,
                    senderId: profile.uid,
                    senderNickname: getMemberName(profile.uid) || profile.nickname,
                });
            }
        } catch (error) {
            justSentRef.current = false;
            setChatUploading(false);
            addToast('메시지 전송에 실패했습니다.', 'error');
        }
    };

    // 이전 메시지 로딩
    const handleLoadOlderMessages = async () => {
        if (loadingOlder || !hasMoreMessages || chatMessages.length === 0) return;
        // ★ 채팅 이력 제한 체크
        const chatLimit = effectiveLimits.chatHistory;
        if (chatMessages.length >= chatLimit) {
            addToast('더 많은 채팅 기록을 보려면 프리미엄이 필요합니다.', 'info');
            setHasMoreMessages(false);
            return;
        }
        isLoadingOlderRef.current = true;
        setLoadingOlder(true);
        try {
            const oldest = chatMessages[0];
            if (!oldest?.createdAt) return;
            // 스크롤 위치 보존을 위해 현재 스크롤 높이 기록
            const container = chatContainerRef.current;
            const prevScrollHeight = container?.scrollHeight || 0;
            const olderMsgs = await loadOlderMessages(projectId, oldest.createdAt, 20);
            const noMore = olderMsgs.length < 20;
            if (noMore) setHasMoreMessages(false);
            if (olderMsgs.length > 0) {
                setChatMessages(prev => {
                    const updated = [...olderMsgs, ...prev];
                    // 캐시 갱신
                    setCachedMessages(projectId, updated, !noMore);
                    return updated;
                });
                // 새 메시지가 추가된 후 스크롤 위치 보존
                requestAnimationFrame(() => {
                    if (container) {
                        container.scrollTop = container.scrollHeight - prevScrollHeight;
                    }
                    // 스크롤 위치 보존 후 ref 해제 (약간의 딜레이)
                    setTimeout(() => { isLoadingOlderRef.current = false; }, 200);
                });
            } else {
                isLoadingOlderRef.current = false;
            }
        } catch (error) {
            addToast('이전 메시지 로딩에 실패했습니다.', 'error');
            isLoadingOlderRef.current = false;
        } finally {
            setLoadingOlder(false);
        }
    };

    // 채팅 스크롤 감지: 상단 도달(이전 메시지 로드) + 하단 근처 여부 추적
    useEffect(() => {
        if (activeTab !== 'chat') return;
        const container = chatContainerRef.current;
        if (!container) return;

        const NEAR_BOTTOM_THRESHOLD = 1000; // 하단에서 1000px 이내면 "하단 근처"로 판단

        const handleScroll = () => {
            // 하단 근처 여부 실시간 추적
            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            isNearBottomRef.current = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD;

            // 상단 도달 시 이전 메시지 자동 로드
            if (container.scrollTop <= 10 && hasMoreMessages && !loadingOlder) {
                handleLoadOlderMessages();
            }
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, [activeTab, hasMoreMessages, loadingOlder]);



    // 설정 모달 열 때 ACL 검증 (관리자용) - pending→true 자동 업데이트
    useEffect(() => {
        if (!showSettingsModal || !userCanAdmin || !myCalendarId || !project) return;
        (async () => {
            try {
                const aclEmails = await getCalendarAclEmails(myCalendarId);
                if (!aclEmails) return;
                const sharedWith = project.calendarSharedWith || {};
                const members = project.members || {};
                const updates = {};
                let hasChanges = false;

                for (const [uid, status] of Object.entries(sharedWith)) {
                    if (!status) continue; // false는 스킵
                    const member = members[uid];
                    if (!member) continue;
                    try {
                        const memberProfile = await getUserProfile(uid);
                        if (memberProfile?.email) {
                            const emailLower = memberProfile.email.toLowerCase();
                            const inAcl = aclEmails.includes(emailLower);
                            if (status === 'pending' && inAcl) {
                                // 참여자가 이메일에서 참여 완료 → true로 업데이트
                                updates[`calendarSharedWith.${uid}`] = true;
                                hasChanges = true;
                            } else if (status === true && !inAcl) {
                                // ACL에서 제거됨 → false로 동기화
                                updates[`calendarSharedWith.${uid}`] = false;
                                hasChanges = true;
                            }
                        }
                    } catch (e) { /* skip */ }
                }

                if (hasChanges) {
                    const { updateDoc, doc, serverTimestamp } = await import('firebase/firestore');
                    const { db } = await import('../services/firebase');
                    await updateDoc(doc(db, 'projects', projectId), {
                        ...updates,
                        updatedAt: serverTimestamp(),
                    });
                    addToast('캘린더 공유 상태가 동기화되었습니다.', 'info');
                }
            } catch (e) { /* skip */ }
        })();
    }, [showSettingsModal, userCanAdmin, myCalendarId]);

    // 설정 모달 열릴 때 팀 캘린더 이름 로딩
    useEffect(() => {
        if (!showSettingsModal || !myCalendarId) { setTeamCalendarName(''); return; }
        if (!hasCalendarToken()) return;
        (async () => {
            try {
                const { getOAuthAccessToken } = await import('../services/calendarService');
                const accessToken = await getOAuthAccessToken();
                const res = await fetch(
                    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(myCalendarId)}`,
                    { headers: { 'Authorization': `Bearer ${accessToken}` } }
                );
                if (res.ok) {
                    const data = await res.json();
                    setTeamCalendarName(data.summary || myCalendarId);
                } else {
                    setTeamCalendarName(myCalendarId);
                }
            } catch { setTeamCalendarName(myCalendarId); }
        })();
    }, [showSettingsModal, myCalendarId]);

    // 날짜 선택 모달 열릴 때 캘린더 목록 자동 로딩
    useEffect(() => {
        if (!showDatePicker) return;
        // 팀 캘린더 공유 상태이면 기본 선택
        if (myCalendarId && calendarSharedMembers[profile?.uid] === true) {
            const cached = localStorage.getItem('lastSelectedCalendarId');
            if (!cached) setPickerCalendarId(myCalendarId);
        }
        if (!hasCalendarToken()) return;
        setLoadingPickerCalendars(true);
        (async () => {
            try {
                const list = await getCalendarList();
                const writable = list.filter(c => c.accessRole === 'owner' || c.accessRole === 'writer');
                setPickerCalendarList(writable);
            } catch (e) { /* skip */ }
            finally { setLoadingPickerCalendars(false); }
        })();
    }, [showDatePicker]);

    // 캐시된 토큰이 있을 때 calendarSynced 아이템 자동 검증 (팝업 없이)
    const calendarVerifiedRef = useRef(false);
    useEffect(() => {
        if (!items.length || calendarVerifiedRef.current) return;
        if (!hasCalendarToken()) return; // 토큰이 없으면 검증 스킵 (팝업 방지)
        const syncedItems = items.filter(item => item.calendarSynced && item.calendarEventId);
        if (!syncedItems.length) return;
        calendarVerifiedRef.current = true;

        (async () => {
            for (const item of syncedItems) {
                try {
                    // 등록된 캘린더 ID를 사용 (없으면 pickerCalendarId 폴백)
                    const calId = item.calendarRegisteredId || pickerCalendarId || 'primary';
                    const exists = await checkEventExists(calId, item.calendarEventId);
                    if (!exists) {
                        await updateCalendarSync(projectId, item.id, null, false);
                    }
                } catch (e) { /* skip */ }
            }
        })();
    }, [myCalendarId, items]);

    const handleToggleCalendar = async (item) => {
        // 이미 등록된 경우 → 등록된 캘린더에서 삭제
        if (item.calendarSynced && item.calendarEventId) {
            const calId = item.calendarRegisteredId || pickerCalendarId || 'primary';
            try {
                // 실제 이벤트가 존재하는지 검증
                const exists = await checkEventExists(calId, item.calendarEventId);
                if (!exists) {
                    // 이벤트가 이미 삭제되었으므로 Firestore만 동기화 해제
                    await updateCalendarSync(projectId, item.id, null, false);
                    addToast('이미 캘린더에서 삭제된 일정입니다. 동기화를 해제했습니다.', 'info');
                    return;
                }
                await removeEventFromCalendar(calId, item.calendarEventId);
                await updateCalendarSync(projectId, item.id, null, false);
                addToast('캘린더에서 해제되었습니다.', 'success');
            } catch (error) {
                addToast(error.message || '캘린더 삭제에 실패했습니다.', 'error');
            }
            return;
        }
        // 미등록 → 날짜 선택 모달 열기
        setCalendarTargetItem(item);
        setSelectedDate(new Date().toISOString().split('T')[0]);
        setShowDatePicker(true);
    };

    const handleCalendarDateSelect = async (dateStr) => {
        if (!calendarTargetItem || !dateStr) return;
        const effectiveId = pickerCalendarId || 'primary';
        setAddingToCalendar(true);
        try {
            const eventId = await addEventToCalendar(effectiveId, calendarTargetItem.title, calendarTargetItem.content || '', dateStr);
            await updateCalendarSync(projectId, calendarTargetItem.id, eventId, true, effectiveId);
            addToast(`${dateStr}에 캘린더 등록 완료!`, 'success');
            setShowDatePicker(false);
            setCalendarTargetItem(null);
        } catch (error) {
            addToast(error.message || '캘린더 등록에 실패했습니다.', 'error');
        } finally {
            setAddingToCalendar(false);
        }
    };

    const handleSaveCalendarId = async () => {
        const trimmedId = calendarId.trim();
        // 빈 값이면 캘린더 해제
        if (!trimmedId) {
            setSavingCalendar(true);
            try {
                const { updateDoc, doc, serverTimestamp } = await import('firebase/firestore');
                const { db } = await import('../services/firebase');
                await updateDoc(doc(db, 'projects', projectId), {
                    googleCalendarId: '',
                    updatedAt: serverTimestamp(),
                });
                addToast('캘린더 연동이 해제되었습니다.', 'info');
                setCalendarIdEditing(false);
            } catch (error) {
                addToast('캘린더 설정 저장에 실패했습니다.', 'error');
            } finally {
                setSavingCalendar(false);
            }
            return;
        }
        // 유효성 검증: Google Calendar API로 캘린더 존재 확인
        setSavingCalendar(true);
        try {
            const { getOAuthAccessToken } = await import('../services/calendarService');
            const accessToken = await getOAuthAccessToken();
            const res = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(trimmedId)}`,
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );
            if (!res.ok) {
                if (res.status === 404) {
                    addToast('존재하지 않는 캘린더 ID입니다. 다시 확인해주세요.', 'error');
                } else if (res.status === 403) {
                    addToast('이 캘린더에 접근 권한이 없습니다.', 'error');
                } else {
                    addToast('캘린더 ID 검증에 실패했습니다. 다시 시도해주세요.', 'error');
                }
                setSavingCalendar(false);
                return;
            }
            // 검증 통과 → 저장
            const { updateDoc, doc, serverTimestamp } = await import('firebase/firestore');
            const { db } = await import('../services/firebase');
            await updateDoc(doc(db, 'projects', projectId), {
                googleCalendarId: trimmedId,
                updatedAt: serverTimestamp(),
            });
            addToast('캘린더 ID가 검증되어 저장되었습니다. ✅', 'success');
            setCalendarIdEditing(false);
        } catch (error) {
            addToast(error.message || '캘린더 설정 저장에 실패했습니다.', 'error');
        } finally {
            setSavingCalendar(false);
        }
    };

    const handleInvite = async (e) => {
        e.preventDefault();
        if (!inviteNickname.trim()) {
            addToast('닉네임 또는 이메일을 입력해주세요.', 'warning');
            return;
        }
        // ★ 멤버 수 제한 체크 (프로젝트 기반)
        const currentMemberCount = project?.memberCount || Object.keys(project?.members || {}).length;
        if (currentMemberCount >= effectiveLimits.maxMembers) {
            setUpgradeReason('maxMembers');
            setShowUpgradeModal(true);
            return;
        }
        setInviting(true);
        try {
            const targetUser = await findUserByNicknameOrEmail(inviteNickname.trim());
            if (!targetUser) {
                addToast('존재하지 않는 사용자입니다.', 'error');
                setInviting(false);
                return;
            }
            if (targetUser.uid === profile.uid) {
                addToast('자기 자신은 초대할 수 없습니다.', 'warning');
                setInviting(false);
                return;
            }
            await inviteUser(projectId, project.name, profile.uid, profile.nickname, targetUser.uid, targetUser.nickname, inviteRole);
            setInviteNickname('');
            setShowInviteModal(false);
            addToast(`${targetUser.nickname}님에게 초대를 보냈습니다!`, 'success');
        } catch (error) {
            addToast(error.message || '초대에 실패했습니다.', 'error');
        } finally {
            setInviting(false);
        }
    };

    // 체크리스트 이미지 추가
    const handleItemImageAdd = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            addToast('이미지 파일만 추가할 수 있습니다.', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            addToast('5MB 이하 이미지만 가능합니다.', 'error');
            return;
        }
        const totalAttachments = (editItem.images || []).length + (editItem.files || []).length;
        if (totalAttachments >= 5) {
            addToast('첨부파일은 이미지+서류 합산 최대 5개까지 가능합니다.', 'error');
            return;
        }
        try {
            setItemImageUploading(true);
            const { downloadUrl } = await uploadItemImage(projectId, editItem.id, file);
            setEditItem(prev => ({
                ...prev,
                images: [...(prev.images || []), downloadUrl],
            }));
            addToast('이미지가 추가되었습니다.', 'success');
        } catch (err) {
            addToast('이미지 업로드에 실패했습니다.', 'error');
        } finally {
            setItemImageUploading(false);
            if (editItemImageRef.current) editItemImageRef.current.value = '';
        }
    };

    // 체크리스트 이미지 삭제
    const handleItemImageRemove = (index) => {
        setEditItem(prev => ({
            ...prev,
            images: (prev.images || []).filter((_, i) => i !== index),
        }));
    };

    // 체크리스트 서류 파일 추가
    const handleItemFileAdd = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            addToast('파일 크기는 5MB 이하만 가능합니다.', 'error');
            return;
        }
        const totalAttachments = (editItem.images || []).length + (editItem.files || []).length;
        if (totalAttachments >= 5) {
            addToast('첨부파일은 이미지+서류 합산 최대 5개까지 가능합니다.', 'error');
            return;
        }
        try {
            setItemFileUploading(true);
            const { downloadUrl, fileName, fileSize, fileType } = await uploadItemFile(projectId, editItem.id, file);
            setEditItem(prev => ({
                ...prev,
                files: [...(prev.files || []), { url: downloadUrl, name: fileName, size: fileSize, type: fileType }],
            }));
            addToast('파일이 추가되었습니다.', 'success');
        } catch (err) {
            addToast(err.message || '파일 업로드에 실패했습니다.', 'error');
        } finally {
            setItemFileUploading(false);
            if (editItemDocRef.current) editItemDocRef.current.value = '';
        }
    };

    // 체크리스트 서류 파일 삭제
    const handleItemFileRemove = (index) => {
        setEditItem(prev => ({
            ...prev,
            files: (prev.files || []).filter((_, i) => i !== index),
        }));
    };

    // CSV 내보내기
    const handleExportCsv = async () => {
        if (!effectiveLimits.exportCsv) {
            setUpgradeReason('exportCsv');
            setShowUpgradeModal(true);
            return;
        }
        try {
            await exportItemsToCsv(items, project.name);
            addToast('CSV 파일이 다운로드되었습니다.', 'success');
        } catch (err) {
            addToast('CSV 내보내기에 실패했습니다.', 'error');
        }
    };

    // CSV 가져오기
    const handleImportCsvClick = () => {
        csvFileRef.current?.click();
    };

    const handleImportCsvFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        try {
            const text = await file.text();
            const parsed = parseCsv(text);
            if (parsed.length === 0) {
                addToast('가져올 항목이 없습니다.', 'warning');
                return;
            }
            const existingTitles = items.filter(i => !i.deleted).map(i => i.title);
            const conflicts = [];
            const noConflicts = [];
            parsed.forEach(item => {
                if (existingTitles.includes(item.title)) {
                    conflicts.push(item);
                } else {
                    noConflicts.push(item);
                }
            });
            if (conflicts.length === 0) {
                await importItems(noConflicts);
                addToast(`${noConflicts.length}개 항목을 가져왔습니다.`, 'success');
            } else {
                setCsvImportConflicts({ noConflicts, conflicts, currentIdx: 0, decisions: [] });
            }
        } catch (err) {
            addToast(err.message || 'CSV 파일을 읽을 수 없습니다.', 'error');
        }
    };

    const handleConflictDecision = async (action) => {
        const state = { ...csvImportConflicts };
        state.decisions.push({ action, item: state.conflicts[state.currentIdx] });
        if (state.currentIdx + 1 < state.conflicts.length) {
            state.currentIdx += 1;
            setCsvImportConflicts(state);
        } else {
            setCsvImportConflicts(null);
            await processImportDecisions(state.noConflicts, state.decisions);
        }
    };

    const processImportDecisions = async (noConflicts, decisions) => {
        const toAdd = [...noConflicts];
        let overwriteCount = 0;
        for (const { action, item } of decisions) {
            if (action === 'skip') continue;
            if (action === 'overwrite') {
                const existing = items.find(i => !i.deleted && i.title === item.title);
                if (existing) {
                    await updateTodoItem(projectId, existing.id, {
                        content: item.content, color: item.color,
                        dueDate: item.dueDate ? Timestamp.fromDate(new Date(item.dueDate)) : null,
                        labels: item.labels, repeatType: item.repeatType,
                    }, { expectedVersion: existing.version || 1 });
                    overwriteCount++;
                }
            } else if (action === 'rename') {
                item.title = item.title + ' (가져옴)';
                toAdd.push(item);
            }
        }
        await importItems(toAdd);
        const total = toAdd.length + overwriteCount;
        addToast(`${total}개 항목을 처리했습니다.`, 'success');
    };

    const importItems = async (parsedItems) => {
        for (const item of parsedItems) {
            await addTodoItem(projectId, {
                type: 'checklist', title: item.title, content: item.content,
                checked: item.checked || false,
                color: item.color,
                dueDate: item.dueDate ? Timestamp.fromDate(new Date(item.dueDate)) : null,
                labels: item.labels, repeatType: item.repeatType,
                createdBy: profile.uid, createdByNickname: getMemberName(profile.uid) || profile.nickname,
            });
        }
    };

    const handleEditItem = async (e) => {
        e?.preventDefault();
        if (!editItem) return;

        // ★ 편집 시 신규 마감일 추가 제한 (기존 마감일 수정은 허용)
        const hadDueDate = !!editItemOriginal?.dueDate;
        const hasDueDate = !!editItem.dueDate;
        if (!hadDueDate && hasDueDate && effectiveLimits.freeDueDateLimit !== Infinity) {
            const dueDateCount = items.filter(i => !i.deleted && i.dueDate && i.id !== editItem.id).length;
            if (dueDateCount >= effectiveLimits.freeDueDateLimit) {
                setUpgradeReason('freeDueDate');
                setShowUpgradeModal(true);
                return;
            }
        }
        // ★ 편집 시 신규 라벨 추가 제한 (기존 라벨 수정은 허용)
        const hadLabels = (editItemOriginal?.labels || []).length > 0;
        const hasLabels = (editItem.labels || []).length > 0;
        if (!hadLabels && hasLabels && effectiveLimits.freeLabelLimit !== Infinity) {
            const labelCount = items.filter(i => !i.deleted && (i.labels || []).length > 0 && i.id !== editItem.id).length;
            if (labelCount >= effectiveLimits.freeLabelLimit) {
                setUpgradeReason('freeLabel');
                setShowUpgradeModal(true);
                return;
            }
        }
        try {
            await updateTodoItem(projectId, editItem.id, {
                title: editItem.title,
                content: editItem.content,
                images: editItem.images || [],
                files: editItem.files || [],
                color: editItem.color || null,
                dueDate: editItem.dueDate || null,
                labels: editItem.labels || [],
                repeatType: editItem.repeatType || null,
                updatedBy: profile?.uid,
            }, { expectedVersion: editItem.version || 1 });
            // 활동 알림 전송 (메인페이지 메세지탭에 표시)
            try {
                const { updateDoc: ud, doc: d, arrayUnion: au } = await import('firebase/firestore');
                const { db: fdb } = await import('../services/firebase');
                await ud(d(fdb, 'projects', projectId), {
                    notifications: au({
                        type: 'activity',
                        action: 'edit',
                        text: `✏️ "${editItem.title}" 항목을 수정했습니다.`,
                        actorId: profile.uid,
                        actorName: getMemberName(profile.uid) || profile.nickname,
                        projectName: project?.name || '',
                        createdAt: new Date().toISOString(),
                        itemId: editItem.id,
                    }),
                });
            } catch (e) { /* 알림 실패해도 수정은 완료 */ }
            setShowEditModal(false);
            setEditItem(null);
            setEditOptionSheet(null);
            addToast('수정되었습니다.', 'success');
        } catch (error) {
            if (error.code === 'VERSION_CONFLICT') {
                setConflictData({
                    serverData: error.serverData,
                    myData: {
                        title: editItem.title, content: editItem.content,
                        images: editItem.images || [], files: editItem.files || [],
                        color: editItem.color || null, dueDate: editItem.dueDate || null,
                        labels: editItem.labels || [], repeatType: editItem.repeatType || null,
                    },
                    itemId: editItem.id,
                });
            } else {
                addToast('수정에 실패했습니다.', 'error');
            }
        }
    };

    // 충돌 처리: 덮어쓰기
    const handleConflictOverwrite = async () => {
        if (!conflictData) return;
        try {
            await updateTodoItem(projectId, conflictData.itemId, {
                title: conflictData.myData.title,
                content: conflictData.myData.content,
                images: conflictData.myData.images || [],
                files: conflictData.myData.files || [],
                color: conflictData.myData.color || null,
                dueDate: conflictData.myData.dueDate || null,
                labels: conflictData.myData.labels || [],
                repeatType: conflictData.myData.repeatType || null,
            }, { forceOverwrite: true });
            addToast('덮어쓰기로 저장되었습니다.', 'success');
            setConflictData(null);
            setShowEditModal(false);
            setEditItem(null);
            setEditOptionSheet(null);
        } catch (error) {
            addToast('덮어쓰기에 실패했습니다.', 'error');
        }
    };

    // 충돌 처리: 다른 이름으로 저장 (새 아이템으로 추가)
    const handleConflictSaveAsNew = async () => {
        if (!conflictData) return;
        try {
            await addTodoItem(projectId, {
                title: conflictData.myData.title + ' (사본)',
                content: conflictData.myData.content,
                images: conflictData.myData.images || [],
                files: conflictData.myData.files || [],
                color: conflictData.myData.color || null,
                dueDate: conflictData.myData.dueDate || null,
                labels: conflictData.myData.labels || [],
                repeatType: conflictData.myData.repeatType || null,
                createdBy: profile.uid,
                createdByNickname: getMemberName(profile.uid) || profile.nickname,
            });
            addToast('새 항목으로 저장되었습니다.', 'success');
            setConflictData(null);
            setShowEditModal(false);
            setEditItem(null);
            setEditOptionSheet(null);
        } catch (error) {
            addToast('새 항목 저장에 실패했습니다.', 'error');
        }
    };

    // 충돌 처리: 취소 (내 변경사항 버리고 서버 데이터로 복귀)
    const handleConflictCancel = () => {
        if (conflictData?.serverData) {
            setEditItem({ ...conflictData.serverData });
        }
        setConflictData(null);
        setIsEditingContent(false);
    };

    const handleLeaveProject = async () => {
        if (!confirm('정말 이 페이지에서 나가시겠습니까?')) return;
        try {
            await leaveProject(projectId, profile.uid);
            navigate('/');
            addToast('페이지에서 나갔습니다.', 'info');
        } catch (error) {
            addToast('페이지 나가기에 실패했습니다.', 'error');
        }
    };

    const handleDeleteProject = async () => {
        if (!confirm('정말 이 페이지를 삭제하시겠습니까?\n모든 데이터가 삭제됩니다.')) return;
        try {
            await deleteProject(projectId);
            navigate('/');
            addToast('페이지가 삭제되었습니다.', 'success');
        } catch (error) {
            addToast('페이지 삭제에 실패했습니다.', 'error');
        }
    };



    const handleChangeRole = async (userId, newRole) => {
        try {
            await changeMemberRole(projectId, userId, newRole);
            addToast('권한이 변경되었습니다.', 'success');
        } catch (error) {
            addToast('권한 변경에 실패했습니다.', 'error');
        }
    };

    const handleRemoveMember = async (userId, nickname) => {
        if (!confirm(`${nickname}님을 페이지에서 내보내시겠습니까?`)) return;
        try {
            await removeMember(projectId, userId);
            addToast(`${nickname}님이 내보내졌습니다.`, 'success');
        } catch (error) {
            addToast('멤버 내보내기에 실패했습니다.', 'error');
        }
    };

    // Rate Limit 대응: 연속 공유 시 1.5초 딜레이
    const shareDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const lastShareTimeRef = useRef(0);

    const handleToggleCalendarShare = async (userId, member) => {
        if (!myCalendarId) return;

        setSharingCalendar(prev => ({ ...prev, [userId]: true }));
        try {
            // Rate Limit 대응: 마지막 공유 요청과 1.5초 간격 유지
            const now = Date.now();
            const elapsed = now - lastShareTimeRef.current;
            if (elapsed < 1500) {
                await shareDelay(1500 - elapsed);
            }

            // 멤버 이메일 조회
            const userProfile = await getUserProfile(userId);
            if (!userProfile?.email) {
                addToast('해당 멤버의 이메일 정보를 찾을 수 없습니다.', 'error');
                return;
            }

            const isShared = calendarSharedMembers[userId];

            if (isShared) {
                await unshareCalendarWithUser(myCalendarId, userProfile.email);
                const { updateDoc, doc, serverTimestamp } = await import('firebase/firestore');
                const { db } = await import('../services/firebase');
                await updateDoc(doc(db, 'projects', projectId), {
                    [`calendarSharedWith.${userId}`]: false,
                    [`calendarShareAccepted.${userId}`]: false,
                    updatedAt: serverTimestamp(),
                });
                // 참여자에게 해제 안내 (메인페이지 메세지탭에 표시)
                try {
                    const { arrayUnion } = await import('firebase/firestore');
                    await updateDoc(doc(db, 'projects', projectId), {
                        notifications: arrayUnion({
                            text: `📅 [${member.displayName || member.nickname}]님의 캘린더 공유가 해제되었습니다.`,
                            projectName: project.name,
                            createdAt: new Date().toISOString(),
                            type: 'calendar',
                        }),
                    });
                } catch (e) { /* skip */ }
            } else {
                await shareCalendarWithUser(myCalendarId, userProfile.email);
                const { updateDoc, doc, serverTimestamp } = await import('firebase/firestore');
                const { db } = await import('../services/firebase');
                await updateDoc(doc(db, 'projects', projectId), {
                    [`calendarSharedWith.${userId}`]: 'pending',
                    [`calendarShareRequests.${userId}`]: false,
                    [`calendarShareAccepted.${userId}`]: false,
                    updatedAt: serverTimestamp(),
                });
                // 참여자에게 안내 메시지 전송 (메인페이지 메세지탭에 표시)
                try {
                    const { arrayUnion } = await import('firebase/firestore');
                    await updateDoc(doc(db, 'projects', projectId), {
                        notifications: arrayUnion({
                            text: `📅 [${member.displayName || member.nickname}]님의 캘린더 공유가 승인되었습니다! 캘린더 탭에서 공유된 캘린더를 확인하세요.`,
                            projectName: project.name,
                            createdAt: new Date().toISOString(),
                            type: 'calendar',
                        }),
                    });
                } catch (e) { /* 메시지 전송 실패해도 공유는 완료 */ }
            }
            lastShareTimeRef.current = Date.now();
        } catch (error) {
            console.error('캘린더 공유 실패:', error);
            addToast(error.message || '캘린더 공유 처리에 실패했습니다.', 'error');
        } finally {
            setSharingCalendar(prev => ({ ...prev, [userId]: false }));
        }
    };

    // 비관리자: 캘린더 공유 요청
    const handleRequestCalendarShare = async () => {
        if (!profile?.uid) return;
        setRequestingShare(true);
        try {
            const { updateDoc, doc, serverTimestamp } = await import('firebase/firestore');
            const { db } = await import('../services/firebase');
            await updateDoc(doc(db, 'projects', projectId), {
                [`calendarShareRequests.${profile.uid}`]: true,
                updatedAt: serverTimestamp(),
            });
            addToast('관리자에게 캘린더 공유를 요청했습니다.', 'success');
        } catch (error) {
            addToast('캘린더 공유 요청에 실패했습니다.', 'error');
        } finally {
            setRequestingShare(false);
        }
    };

    // 활동명 미입력 감지
    useEffect(() => {
        if (!project || !profile) return;
        if (!project.useDisplayName) return;
        const myMember = project.members?.[profile.uid];
        if (myMember && !myMember.displayName) {
            setShowDisplayNamePrompt(true);
        }
    }, [project?.useDisplayName, project?.members, profile?.uid]);

    const handleSaveMyDisplayName = async () => {
        const dn = myDisplayNameInput.trim();
        if (!dn) { addToast('활동명을 입력해주세요.', 'warning'); return; }
        if (dn.length < 2 || dn.length > 20) { addToast('활동명은 2~20자로 입력해주세요.', 'warning'); return; }
        try {
            await updateMemberDisplayName(projectId, profile.uid, dn);
            setShowDisplayNamePrompt(false);
            setMyDisplayNameInput('');
            addToast('활동명이 설정되었습니다!', 'success');
        } catch (error) {
            addToast(error.message || '활동명 설정 실패', 'error');
        }
    };

    if (!project) {
        return (
            <div className="loading-screen">
                <div className="spinner spinner-lg"></div>
                <p style={{ color: 'var(--color-text-secondary)' }}>로딩 중...</p>
            </div>
        );
    }

    const members = project.members ? Object.entries(project.members) : [];

    return (
        <div className="page">
            <div className="container">
                {/* 헤더 */}
                <div className="page-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                        <button className="page-header-back" onClick={() => navigate('/')}>←</button>
                        <h1 style={{ fontSize: 'var(--font-size-xl)' }}>{project.name}</h1>
                    </div>
                    <div className="header-actions">
                        {userCanAdmin && (
                            <button className="header-icon-btn" onClick={() => setShowInviteModal(true)} title="초대">
                                👤+
                            </button>
                        )}
                        <button
                            className="header-icon-btn"
                            onClick={() => {
                                setRefreshing(true);
                                setRefreshKey(k => k + 1);
                                setTimeout(() => setRefreshing(false), 500);
                            }}
                            title="새로고침"
                            disabled={refreshing}
                        >
                            {refreshing ? '⏳' : '🔄'}
                        </button>
                        <button
                            className="header-icon-btn"
                            onClick={togglePageViewMode}
                            title={`보기: ${VIEW_MODE_LABELS[pageViewMode]}`}
                        >
                            {VIEW_MODE_ICONS[pageViewMode]}
                        </button>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            <button className="header-icon-btn" onClick={() => {
                                if (!effectiveLimits.exportCsv) {
                                    setUpgradeReason('exportCsv'); setShowUpgradeModal(true); return;
                                }
                                setShowCsvMenu(prev => !prev);
                            }} title="CSV 관리">🗂️</button>
                            {showCsvMenu && (
                                <div className="csv-dropdown-menu">
                                    <button onClick={() => { handleExportCsv(); setShowCsvMenu(false); }}>📥 CSV 내보내기</button>
                                    <button onClick={() => { handleImportCsvClick(); setShowCsvMenu(false); }}>📤 CSV 가져오기</button>
                                </div>
                            )}
                        </div>
                        <button className="header-icon-btn" onClick={() => setShowSettingsModal(true)} title="페이지 설정">
                            ⚙️
                        </button>
                    </div>
                </div>

                {/* 읽기 전용 배너 — 무료 플랜에서 멤버 수 초과 시 */}
                {(project?.ownerPlan || 'free') === 'free' && project?.memberCount > LIMITS.free.maxMembers && (
                    <div className="readonly-banner">
                        🔒 멤버 수가 무료 한도({LIMITS.free.maxMembers}명)를 초과했습니다. 관리자가 구독을 업그레이드하면 모든 기능을 사용할 수 있습니다.
                    </div>
                )}

                {/* 탭 필터 */}
                <div className="tab-bar">
                    <button
                        className={`tab-item ${activeTab === 'checklist' ? 'active' : ''}`}
                        onClick={() => {
                            if (activeTab === 'checklist') {
                                setShowFilterPanel(prev => !prev);
                            } else {
                                setActiveTab('checklist');
                                setShowFilterPanel(false);
                            }
                        }}
                    >
                        ✅ 체크리스트{activeFilterCount > 0 && ` 🔍${activeFilterCount}`}
                    </button>
                    <button className={`tab-item ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => { setActiveTab('chat'); setShowFilterPanel(false); }}>
                        💬 채팅
                    </button>
                    <button
                        className={`tab-item ${activeTab === 'calendar' ? 'active' : ''}`}
                        onClick={() => {
                            if (!effectiveLimits.calendar) {
                                setUpgradeReason('calendar');
                                setShowUpgradeModal(true);
                                return;
                            }
                            if (activeTab === 'calendar') {
                                setShowCalendarFilter(prev => !prev);
                            } else {
                                setActiveTab('calendar');
                                setShowCalendarFilter(false);
                            }
                        }}
                    >
                        📅 캘린더 {!effectiveLimits.calendar && '🔒'}
                    </button>
                    <button
                        className={`tab-item ${activeTab === 'stats' ? 'active' : ''}`}
                        onClick={() => {
                            if (!effectiveLimits.statistics) {
                                setUpgradeReason('statistics');
                                setShowUpgradeModal(true);
                                return;
                            }
                            setActiveTab('stats');
                        }}
                    >
                        📊 통계{!effectiveLimits.statistics && ' 🔒'}
                    </button>
                    <button className={`tab-item ${activeTab === 'trash' ? 'active' : ''}`} onClick={() => {
                        if (activeTab === 'trash') { setTrashSelectMode(v => !v); setTrashSelected([]); }
                        else { setActiveTab('trash'); setTrashSelectMode(false); setTrashSelected([]); }
                    }}>
                        🗑️ {deletedItems.length > 0 && ` (${deletedItems.length})`}
                    </button>
                </div>

                {/* 필터 패널 */}
                {showFilterPanel && activeTab === 'checklist' && (
                    <div className="filter-panel">
                        {/* 중요도 */}
                        <div className="filter-section">
                            <span className="filter-section-title">🏅 중요도</span>
                            <div className="filter-chips">
                                {LABEL_COLORS.map(c => (
                                    <button
                                        key={c.id}
                                        className={`filter-chip ${filters.colors.includes(c.id) ? 'active' : ''}`}
                                        onClick={() => setFilters(prev => ({
                                            ...prev,
                                            colors: prev.colors.includes(c.id)
                                                ? prev.colors.filter(x => x !== c.id)
                                                : [...prev.colors, c.id]
                                        }))}
                                    >
                                        <span className="filter-chip-dot" style={{ background: c.hex }} />
                                        {c.name}
                                    </button>
                                ))}
                                <button
                                    className={`filter-chip ${filters.colors.includes('none') ? 'active' : ''}`}
                                    onClick={() => setFilters(prev => ({
                                        ...prev,
                                        colors: prev.colors.includes('none')
                                            ? prev.colors.filter(x => x !== 'none')
                                            : [...prev.colors, 'none']
                                    }))}
                                >
                                    <span className="filter-chip-dot" style={{ background: 'var(--color-bg)', border: '2px dashed var(--color-text-muted)' }} />
                                    무순위
                                </button>
                            </div>
                        </div>

                        {/* 마감일 */}
                        <div className="filter-section">
                            <span className="filter-section-title">⏰ 마감</span>
                            <div className="filter-chips">
                                {[
                                    { id: 'overdue', label: '기한초과', emoji: '🔴' },
                                    { id: 'day1', label: '~1일', emoji: '🟠' },
                                    { id: 'day3', label: '1~3일', emoji: '🟡' },
                                    { id: 'day7', label: '3~7일', emoji: '🔵' },
                                    { id: 'day14', label: '7~14일', emoji: '🟣' },
                                    { id: 'later', label: '이후', emoji: '⚪' },
                                ].map(d => (
                                    <button
                                        key={d.id}
                                        className={`filter-chip ${filters.due.includes(d.id) ? 'active' : ''}`}
                                        onClick={() => setFilters(prev => ({
                                            ...prev,
                                            due: prev.due.includes(d.id)
                                                ? prev.due.filter(x => x !== d.id)
                                                : [...prev.due, d.id]
                                        }))}
                                    >
                                        {d.emoji} {d.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 라벨 */}
                        {(project?.projectLabels || []).length > 0 && (
                            <div className="filter-section">
                                <span className="filter-section-title">🏷️ 라벨</span>
                                <div className="filter-chips">
                                    {(project?.projectLabels || []).map(label => (
                                        <button
                                            key={label}
                                            className={`filter-chip ${filters.labels.includes(label) ? 'active' : ''}`}
                                            onClick={() => setFilters(prev => ({
                                                ...prev,
                                                labels: prev.labels.includes(label)
                                                    ? prev.labels.filter(x => x !== label)
                                                    : [...prev.labels, label]
                                            }))}
                                        >
                                            🏷️ {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 기타 */}
                        <div className="filter-section">
                            <span className="filter-section-title">기타</span>
                            <div className="filter-chips">
                                <button
                                    className={`filter-chip ${filters.repeat === 'yes' ? 'active' : ''}`}
                                    onClick={() => setFilters(prev => ({
                                        ...prev, repeat: prev.repeat === 'yes' ? null : 'yes'
                                    }))}
                                >🔄 반복</button>
                                <button
                                    className={`filter-chip ${filters.attachment === 'yes' ? 'active' : ''}`}
                                    onClick={() => setFilters(prev => ({
                                        ...prev, attachment: prev.attachment === 'yes' ? null : 'yes'
                                    }))}
                                >📎 첨부</button>
                                <button
                                    className={`filter-chip ${filters.attachment === 'image' ? 'active' : ''}`}
                                    onClick={() => setFilters(prev => ({
                                        ...prev, attachment: prev.attachment === 'image' ? null : 'image'
                                    }))}
                                >🖼️ 이미지</button>
                                <button
                                    className={`filter-chip ${filters.attachment === 'file' ? 'active' : ''}`}
                                    onClick={() => setFilters(prev => ({
                                        ...prev, attachment: prev.attachment === 'file' ? null : 'file'
                                    }))}
                                >📄 서류</button>
                                <button
                                    className={`filter-chip ${filters.status === 'checked' ? 'active' : ''}`}
                                    onClick={() => setFilters(prev => ({
                                        ...prev, status: prev.status === 'checked' ? null : 'checked'
                                    }))}
                                >✅ 완료</button>
                                <button
                                    className={`filter-chip ${filters.status === 'unchecked' ? 'active' : ''}`}
                                    onClick={() => setFilters(prev => ({
                                        ...prev, status: prev.status === 'unchecked' ? null : 'unchecked'
                                    }))}
                                >⬜ 미완료</button>
                            </div>
                        </div>

                        {/* 구성원 */}
                        <div className="filter-section">
                            <span className="filter-section-title">
                                👥 구성원 {filters.members.length > 0 && `(${filters.members.length})`}
                            </span>
                            <div className="filter-chips">
                                {allMemberList.map(member => (
                                    <button key={member.uid}
                                        className={`filter-chip ${filters.members.includes(member.uid) ? 'active' : ''}`}
                                        onClick={() => setFilters(prev => ({
                                            ...prev,
                                            members: prev.members.includes(member.uid)
                                                ? prev.members.filter(x => x !== member.uid)
                                                : [...prev.members, member.uid]
                                        }))}
                                    >
                                        {member.nickname}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 초기화 */}
                        {activeFilterCount > 0 && (
                            <button
                                className="filter-clear-btn"
                                onClick={() => setFilters({
                                    colors: [], due: [], labels: [],
                                    repeat: null, attachment: null, status: null, members: [],
                                })}
                            >
                                🗑️ 필터 초기화
                            </button>
                        )}
                    </div>
                )}

                {activeTab === 'calendar' && (
                    <div className="calendar-tab">
                        <CalendarView
                            calendarId={myCalendarId}
                            onToast={addToast}
                            refreshKey={refreshKey}
                            showCalendarFilter={showCalendarFilter}
                            onFilterClose={() => setShowCalendarFilter(false)}
                        />
                    </div>
                )}

                {/* 채팅 탭 - 전체화면 */}
                {activeTab === 'chat' && (
                    <div className="chat-container">
                        {/* 채팅 전용 헤더 */}
                        <div className="page-header" style={{ padding: 'var(--spacing-md) 0', margin: '0 var(--spacing-md)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                                <button className="page-header-back" onClick={() => navigate('/')}>←</button>
                                <h1 style={{ fontSize: 'var(--font-size-xl)' }}>{project.name}</h1>
                            </div>
                            <div className="header-actions">
                                {userCanAdmin && (
                                    <button className="header-icon-btn" onClick={() => setShowInviteModal(true)} title="초대">
                                        👤+
                                    </button>
                                )}
                                <button
                                    className="header-icon-btn"
                                    onClick={() => {
                                        setRefreshing(true);
                                        setRefreshKey(k => k + 1);
                                        setTimeout(() => setRefreshing(false), 500);
                                    }}
                                    title="새로고침"
                                    disabled={refreshing}
                                >
                                    {refreshing ? '⏳' : '🔄'}
                                </button>
                                <button
                                    className="header-icon-btn"
                                    onClick={togglePageViewMode}
                                    title={`보기: ${VIEW_MODE_LABELS[pageViewMode]}`}
                                >
                                    {VIEW_MODE_ICONS[pageViewMode]}
                                </button>
                                <div style={{ position: 'relative', display: 'inline-block' }}>
                                    <button className="header-icon-btn" onClick={() => {
                                        if (!effectiveLimits.exportCsv) {
                                            setUpgradeReason('exportCsv'); setShowUpgradeModal(true); return;
                                        }
                                        setShowCsvMenu(prev => !prev);
                                    }} title="CSV 관리">🗂️</button>
                                    {showCsvMenu && (
                                        <div className="csv-dropdown-menu">
                                            <button onClick={() => { handleExportCsv(); setShowCsvMenu(false); }}>📥 CSV 내보내기</button>
                                            <button onClick={() => { handleImportCsvClick(); setShowCsvMenu(false); }}>📤 CSV 가져오기</button>
                                        </div>
                                    )}
                                </div>
                                <button className="header-icon-btn" onClick={() => setShowSettingsModal(true)} title="페이지 설정">
                                    ⚙️
                                </button>
                            </div>
                        </div>
                        {/* 채팅 전용 탭바 */}
                        <div className="tab-bar" style={{ margin: '0 var(--spacing-md)', marginBottom: 0, flexShrink: 0 }}>
                            <button className={`tab-item`} onClick={() => setActiveTab('checklist')}>
                                ✅ 체크리스트
                            </button>
                            <button className={`tab-item active`}>
                                💬 채팅
                            </button>
                            <button className={`tab-item`} onClick={() => {
                                if (!effectiveLimits.calendar) {
                                    setUpgradeReason('calendar');
                                    setShowUpgradeModal(true);
                                    return;
                                }
                                setActiveTab('calendar');
                            }}>
                                📅 캘린더{!effectiveLimits.calendar && ' 🔒'}
                            </button>
                            <button className={`tab-item`} onClick={() => {
                                if (!effectiveLimits.statistics) {
                                    setUpgradeReason('statistics');
                                    setShowUpgradeModal(true);
                                    return;
                                }
                                setActiveTab('stats');
                            }}>
                                📊 통계{!effectiveLimits.statistics && ' 🔒'}
                            </button>
                            <button className={`tab-item`} onClick={() => {
                                if (activeTab === 'trash') { setTrashSelectMode(v => !v); setTrashSelected([]); }
                                else { setActiveTab('trash'); setTrashSelectMode(false); setTrashSelected([]); }
                            }}>
                                🗑️ {deletedItems.length > 0 && ` (${deletedItems.length})`}
                            </button>
                        </div>
                        {/* 메시지 영역 */}
                        <div className="chat-messages" ref={chatContainerRef}>
                            {loadingOlder && (
                                <div className="chat-load-more" style={{ textAlign: 'center', padding: 'var(--spacing-sm)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                                    ⏳ 이전 메시지 불러오는 중...
                                </div>
                            )}
                            {hasMoreMessages && chatMessages.length >= 20 && !loadingOlder && (
                                <button
                                    className="chat-load-more"
                                    onClick={handleLoadOlderMessages}
                                    disabled={loadingOlder}
                                >
                                    ↑ 위로 스크롤하여 이전 메시지 보기
                                </button>
                            )}
                            {chatMessages.length === 0 ? (
                                <div className="empty-state" style={{ padding: '40px 0' }}>
                                    <div className="empty-state-icon">💬</div>
                                    <div className="empty-state-title">아직 메시지가 없습니다</div>
                                    <div className="empty-state-text">첫 메시지를 보내보세요!</div>
                                </div>
                            ) : (
                                chatMessages.filter(msg => {
                                    if (msg.senderId === 'system') return false;
                                    // activity = 본인 변경 제외, 타인 변경만 표시
                                    if (msg.type === 'activity' && msg.senderId === profile?.uid) return false;
                                    return true;
                                }).map((msg) => {
                                    const isMe = msg.senderId === profile?.uid;
                                    const time = msg.createdAt?.toDate
                                        ? msg.createdAt.toDate().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                                        : '';
                                    // activity 메시지 — 시스템 스타일
                                    if (msg.type === 'activity') {
                                        return (
                                            <div key={msg.id} className="chat-activity-wrapper">
                                                <div className="chat-activity">{msg.text}</div>
                                                <div className="chat-activity-meta">
                                                    {getMemberName(msg.senderId) || msg.senderNickname} · {time}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={msg.id} className={`chat-bubble-wrapper ${isMe ? 'mine' : 'others'}`}>
                                            {!isMe && (
                                                <div className="chat-sender"
                                                    style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                                    onClick={async () => {
                                                        if (profile.uid === msg.senderId) return;
                                                        const name = getMemberName(msg.senderId) || msg.senderNickname;
                                                        setChatDmRecipient(name);
                                                        setChatDmSearchResult(null);
                                                        setChatDmMessage('');
                                                        setShowChatDm(true);
                                                        // 자동 검색
                                                        setChatDmSearching(true);
                                                        const user = await findUserByNicknameOrEmail(name);
                                                        setChatDmSearchResult(user || null);
                                                        if (!user) addToast('사용자를 찾을 수 없습니다.', 'error');
                                                        setChatDmSearching(false);
                                                    }}
                                                    title="클릭하여 메시지 보내기"
                                                >{getMemberName(msg.senderId) || msg.senderNickname}</div>
                                            )}
                                            <div className={`chat-bubble ${isMe ? 'mine' : 'others'}`}>
                                                {msg.type === 'image' && msg.mediaUrl ? (
                                                    <img
                                                        src={msg.mediaUrl}
                                                        alt={msg.mediaName || '이미지'}
                                                        className="chat-image"
                                                        onClick={() => setViewerImage(msg.mediaUrl)}
                                                    />
                                                ) : null}
                                                {msg.text && <span>{msg.text}</span>}
                                            </div>
                                            <div className="chat-time">{time}</div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={chatEndRef} />
                        </div>
                        {/* 이미지 미리보기 */}
                        {chatImagePreview && (
                            <div className="chat-image-preview">
                                <img src={chatImagePreview} alt="미리보기" />
                                <button type="button" className="chat-image-preview-cancel" onClick={handleChatImageCancel}>×</button>
                            </div>
                        )}
                        {/* 입력 바 */}
                        <form className="chat-input-bar" onSubmit={handleSendMessage} onTouchMove={(e) => e.preventDefault()}>
                            {/* 📷 이미지 첨부 버튼 — 비구독: 자물쇠 / 구독: 카메라 */}
                            <>
                                <button
                                    type="button"
                                    className="chat-attach-btn"
                                    onClick={() => {
                                        if (!userLimits.imageChat) {
                                            setUpgradeReason('imageChat');
                                            setShowUpgradeModal(true);
                                            return;
                                        }
                                        chatFileInputRef.current?.click();
                                    }}
                                    disabled={chatUploading}
                                    title={userLimits.imageChat ? '이미지 전송' : '구독 전용 기능'}
                                >
                                    {chatUploading ? '⏳' : userLimits.imageChat ? '📷' : '🔒'}
                                </button>
                                {userLimits.imageChat && (
                                    <input
                                        ref={chatFileInputRef}
                                        type="file"
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={handleChatImageSelect}
                                    />
                                )}
                            </>
                            <input
                                ref={chatInputRef}
                                type="text"
                                className="chat-input"
                                placeholder="메시지를 입력하세요..."
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                            />
                            <button type="submit" className="chat-send-btn" disabled={(!chatInput.trim() && !chatImageFile) || chatUploading}>
                                {chatUploading ? '⏳' : '➤'}
                            </button>
                        </form>
                    </div>
                )}

                {/* 휴지통 탭 */}
                {activeTab === 'trash' && (
                    <div className="trash-container">
                        {deletedItems.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-state-icon">🗑️</div>
                                <div className="empty-state-title">휴지통이 비어있습니다</div>
                                <div className="empty-state-text">삭제된 항목은 7일 후 자동으로 영구 삭제됩니다</div>
                            </div>
                        ) : (
                            <>
                                {trashSelectMode && (
                                    <div className="trash-select-bar">
                                        <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                                            <button className="btn btn-sm btn-secondary" onClick={() => {
                                                setTrashSelected(trashSelected.length === deletedItems.length ? [] : deletedItems.map(i => i.id));
                                            }}>{trashSelected.length === deletedItems.length ? '전체 해제' : '전체 선택'}</button>
                                            <button className="btn btn-sm btn-secondary" onClick={handleRestoreSelected} disabled={trashSelected.length === 0}>선택 복구</button>
                                            <button className="btn btn-sm btn-danger" onClick={handleDeleteSelected} disabled={trashSelected.length === 0}>선택 삭제</button>
                                            <button className="btn btn-sm btn-secondary" onClick={() => { setTrashSelectMode(false); setTrashSelected([]); }}>취소</button>
                                        </div>
                                    </div>
                                )}
                                {deletedItems.map((item) => (
                                    <div key={item.id} className={`trash-item card ${trashSelectMode && trashSelected.includes(item.id) ? 'selected' : ''}`}
                                        onClick={trashSelectMode ? () => setTrashSelected(prev => prev.includes(item.id) ? prev.filter(x => x !== item.id) : [...prev, item.id]) : undefined}
                                    >
                                        {trashSelectMode && (
                                            <input type="checkbox" checked={trashSelected.includes(item.id)} readOnly className="trash-checkbox" />
                                        )}
                                        <div className="trash-item-info">
                                            <h4 className="trash-item-title">{item.title}</h4>
                                            {item.content && <p className="trash-item-desc">{item.content}</p>}
                                            <span className="trash-item-days">
                                                🕐 {item.daysLeft}일 후 영구 삭제
                                            </span>
                                        </div>
                                        {!trashSelectMode && (
                                            <div className="trash-item-actions">
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => handleRestoreItem(item.id)}
                                                >복원</button>
                                                <button
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handlePermanentDelete(item.id)}
                                                >삭제</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                )}

                {/* 통계 탭 */}
                {activeTab === 'stats' && statsData && (
                    <div className="stats-container">
                        {/* 전체 현황 */}
                        <div className="stats-card">
                            <h3 className="stats-card-title">📋 전체 현황</h3>
                            <div className="stats-summary-row">
                                <div className="stats-summary-item">
                                    <span className="stats-summary-number">{statsData.total}</span>
                                    <span className="stats-summary-label">전체</span>
                                </div>
                                <div className="stats-summary-item checked clickable" onClick={() => handleStatsClick({ status: 'checked' })}>
                                    <span className="stats-summary-number">{statsData.checked}</span>
                                    <span className="stats-summary-label">완료</span>
                                </div>
                                <div className="stats-summary-item clickable" onClick={() => handleStatsClick({ status: 'unchecked' })}>
                                    <span className="stats-summary-number">{statsData.unchecked}</span>
                                    <span className="stats-summary-label">미완료</span>
                                </div>
                            </div>
                            <div className="stats-progress">
                                <div className="stats-progress-bar" style={{ width: `${statsData.rate}%` }} />
                            </div>
                            <div className="stats-progress-label">{statsData.rate}% 완료</div>
                        </div>

                        {/* 마감일 현황 */}
                        <div className="stats-card">
                            <h3 className="stats-card-title">⏰ 마감일 현황 (미완료)</h3>
                            <div className="stats-grid cols-3">
                                <div className="stats-grid-item danger clickable" onClick={() => handleStatsClick({ due: ['overdue'], status: 'unchecked' })}>
                                    <span className="stats-grid-number">{statsData.overdue}</span>
                                    <span className="stats-grid-label">🔴 기한초과</span>
                                </div>
                                <div className="stats-grid-item warning clickable" onClick={() => handleStatsClick({ due: ['day1'], status: 'unchecked' })}>
                                    <span className="stats-grid-number">{statsData.day1}</span>
                                    <span className="stats-grid-label">🟠 ~1일</span>
                                </div>
                                <div className="stats-grid-item caution clickable" onClick={() => handleStatsClick({ due: ['day3'], status: 'unchecked' })}>
                                    <span className="stats-grid-number">{statsData.day3}</span>
                                    <span className="stats-grid-label">🟡 1~3일</span>
                                </div>
                                <div className="stats-grid-item info clickable" onClick={() => handleStatsClick({ due: ['day7'], status: 'unchecked' })}>
                                    <span className="stats-grid-number">{statsData.day7}</span>
                                    <span className="stats-grid-label">🔵 3~7일</span>
                                </div>
                                <div className="stats-grid-item purple clickable" onClick={() => handleStatsClick({ due: ['day14'], status: 'unchecked' })}>
                                    <span className="stats-grid-number">{statsData.day14}</span>
                                    <span className="stats-grid-label">🟣 7~14일</span>
                                </div>
                                <div className="stats-grid-item clickable" onClick={() => handleStatsClick({ due: ['later'], status: 'unchecked' })}>
                                    <span className="stats-grid-number">{statsData.later}</span>
                                    <span className="stats-grid-label">⚪ 이후</span>
                                </div>
                            </div>
                        </div>

                        {/* 색상별 */}
                        <div className="stats-card">
                            <h3 className="stats-card-title">🎨 색상별</h3>
                            {Object.entries(statsData.byColor).map(([name, data]) => (
                                <div key={name} className="stats-row clickable" onClick={() => handleStatsClick({ colors: [data.colorId ?? 'none'] })}>
                                    <span className="stats-row-name">
                                        <span className="stats-color-dot" style={{ background: data.hex }} />
                                        {name}
                                    </span>
                                    <span className="stats-row-value">{data.checked}/{data.total} 완료</span>
                                </div>
                            ))}
                        </div>

                        {/* 라벨별 */}
                        <div className="stats-card">
                            <h3 className="stats-card-title">🏷️ 라벨별</h3>
                            {Object.entries(statsData.byLabel).map(([label, data]) => (
                                <div key={label} className="stats-row clickable" onClick={() => handleStatsClick({ labels: [label] })}>
                                    <span className="stats-row-name">{label}</span>
                                    <span className="stats-row-value">{data.checked}/{data.total} 완료</span>
                                </div>
                            ))}
                            {Object.keys(statsData.byLabel).length === 0 && (
                                <p className="stats-empty">라벨이 없습니다.</p>
                            )}
                        </div>

                        {/* 기타 */}
                        <div className="stats-card">
                            <h3 className="stats-card-title">📌 기타</h3>
                            <div className="stats-row clickable" onClick={() => handleStatsClick({ repeat: 'yes' })}>
                                <span className="stats-row-name">🔄 반복</span>
                                <span className="stats-row-value">{statsData.withRepeat}개</span>
                            </div>
                            <div className="stats-row clickable" onClick={() => handleStatsClick({ attachment: 'yes' })}>
                                <span className="stats-row-name">📎 첨부</span>
                                <span className="stats-row-value">{statsData.withAttachment}개 (🖼️{statsData.withImage} 📄{statsData.withFile})</span>
                            </div>
                            <div className="stats-row clickable" onClick={() => handleStatsClick({ status: 'checked' })}>
                                <span className="stats-row-name">✅ 완료</span>
                                <span className="stats-row-value">{statsData.checked}개</span>
                            </div>
                            <div className="stats-row clickable" onClick={() => handleStatsClick({ status: 'unchecked' })}>
                                <span className="stats-row-name">⬜ 미완료</span>
                                <span className="stats-row-value">{statsData.unchecked}개</span>
                            </div>
                        </div>

                        {/* 구성원별 */}
                        <div className="stats-card">
                            <h3 className="stats-card-title">👥 구성원별</h3>
                            {Object.entries(statsData.byMember).map(([key, data]) => (
                                <div key={key} className="stats-row clickable" onClick={() => handleStatsClick({ members: [data.uid || key] })}>
                                    <span className="stats-row-name">{data.name}</span>
                                    <span className="stats-row-value">생성 {data.created} / 완료 {data.checked}</span>
                                </div>
                            ))}
                            {Object.keys(statsData.byMember).length === 0 && (
                                <p className="stats-empty">아직 데이터가 없습니다.</p>
                            )}
                        </div>
                    </div>
                )}

                {/* 체크리스트 아이템 목록 */}
                {activeTab === 'checklist' && (
                    <div
                        className={`todo-list ${pageViewMode === 'grid' ? 'todo-list-grid' : pageViewMode === 'list' ? 'todo-list-compact' : pageViewMode === 'detail' ? 'todo-list-detail' : ''}`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                    >
                        {filteredItems.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-state-icon">{activeFilterCount > 0 ? '🔍' : '✅'}</div>
                                <div className="empty-state-title">
                                    {activeFilterCount > 0 ? '조건에 맞는 항목이 없습니다' : '체크리스트가 없습니다'}
                                </div>
                                <div className="empty-state-text">
                                    {activeFilterCount > 0
                                        ? <button className="filter-clear-btn" onClick={() => setFilters({ colors: [], due: [], labels: [], repeat: null, attachment: null, status: null, members: [] })}>필터 초기화</button>
                                        : '+ 버튼을 눌러 추가해보세요'
                                    }
                                </div>
                            </div>
                        ) : (
                            filteredItems.map((item, index) => (
                                <div
                                    key={item.id}
                                    className={`todo-item card ${item.checked ? 'todo-checked' : ''} ${dragOverId === item.id ? 'drag-over' : ''}`}
                                    style={item.color ? { borderLeft: `4px solid ${COLOR_MAP[item.color] || 'transparent'}` } : {}}
                                    draggable={userCanWrite && !item.locked && activeFilterCount === 0}
                                    onDragStart={(e) => handleDragStart(e, item.id)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(e) => handleDragOver(e, item.id)}
                                    onDrop={handleDrop}
                                >
                                    <div className="todo-item-main">
                                        <div className="todo-left-actions">
                                            <button
                                                className={`todo-checkbox ${item.checked ? 'checked' : ''}`}
                                                onClick={() => handleToggleCheck(item)}
                                                disabled={!userCanWrite || item.locked}
                                            >
                                                {item.checked && '✓'}
                                            </button>
                                            <button
                                                className="todo-fav-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const isFav = favoriteItemSet.has(`${projectId}_${item.id}`);
                                                    if (isFav) {
                                                        if (window.confirm('즐겨찾기를 해제하시겠습니까?')) {
                                                            removeFavoriteItem(profile.uid, projectId, item.id);
                                                        }
                                                    } else {
                                                        addFavoriteItem(profile.uid, projectId, item.id, item.title, project?.name || '');
                                                    }
                                                }}
                                                title="즐겨찾기"
                                            >
                                                {favoriteItemSet.has(`${projectId}_${item.id}`) ? '⭐' : '☆'}
                                            </button>
                                        </div>
                                        <div className="todo-content" onClick={() => {
                                            if (userCanWrite && !item.locked) {
                                                const copy = { ...item };
                                                setEditItem(copy);
                                                setEditItemOriginal({ ...copy });
                                                setIsEditingContent(false);
                                                setShowEditModal(true);
                                            } else {
                                                // 잠긴 상태에서도 읽기 전용으로 열기
                                                const copy = { ...item };
                                                setEditItem(copy);
                                                setEditItemOriginal({ ...copy });
                                                setIsEditingContent(false);
                                                setShowEditModal(true);
                                            }
                                        }}>
                                            <h4 className={`todo-title ${item.checked ? 'line-through' : ''}`}>
                                                {(() => {
                                                    const dp = getDuePriority(item.dueDate);
                                                    return dp.level > 0 ? (
                                                        <span className="priority-badge" style={{ color: dp.color }} title={`마감: ${item.dueDate?.toDate ? item.dueDate.toDate().toLocaleString('ko-KR') : ''}`}>
                                                            {dp.icon}
                                                        </span>
                                                    ) : null;
                                                })()}
                                                {item.repeatType && item.repeatType !== 'none' && (
                                                    <span className="priority-badge" title={
                                                        item.repeatType === 'daily' ? '매일 반복' :
                                                            item.repeatType === 'weekly' ? '매주 반복' :
                                                                item.repeatType === 'monthly' ? '매달 반복' :
                                                                    item.repeatType.startsWith('weekday:') ? `매주 ${['일', '월', '화', '수', '목', '금', '토'][parseInt(item.repeatType.split(':')[1])]}요일 반복` :
                                                                        item.repeatType.startsWith('monthday:') ? `매달 ${item.repeatType.split(':')[1]}일 반복` : '반복'
                                                    }>
                                                        🔄
                                                    </span>
                                                )}
                                                {pageViewMode !== 'grid' && item.dueDate && (() => {
                                                    const dueText = formatDueText(item.dueDate);
                                                    const dp = getDuePriority(item.dueDate);
                                                    return dueText ? (
                                                        <span className="due-date-inline" style={{ color: dp.color }}>{dueText}</span>
                                                    ) : null;
                                                })()}
                                                {item.title}
                                            </h4>
                                            {item.content && (
                                                <div className="todo-detail">
                                                    <p className="todo-desc">{item.content}</p>
                                                </div>
                                            )}
                                            {((item.images || []).length > 0 || (item.files || []).length > 0) && (
                                                <span className="todo-attach-icons">
                                                    {(item.images || []).length > 0 && <span>📷 {item.images.length}</span>}
                                                    {(item.files || []).length > 0 && <span>📄 {item.files.length}</span>}
                                                </span>
                                            )}
                                            <span className="todo-meta">
                                                {getMemberName(item.createdBy) || item.createdByNickname}
                                                {(item.labels || []).length > 0 && (
                                                    <span className="item-labels">
                                                        {item.labels.map(l => (
                                                            <span key={l} className="item-label-badge">{l}</span>
                                                        ))}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="todo-actions">
                                        {userCanWrite && (
                                            <button
                                                className={`todo-lock-btn`}
                                                onClick={async () => {
                                                    try {
                                                        await updateTodoItem(projectId, item.id, {
                                                            locked: !item.locked,
                                                        });
                                                    } catch (err) {
                                                        addToast('잠금 상태 변경에 실패했습니다.', 'error');
                                                    }
                                                }}
                                                title={item.locked ? '잠금 해제' : '잠금'}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    fontSize: '1.1rem',
                                                    padding: '4px',
                                                    opacity: item.locked ? 1 : 0.5,
                                                }}
                                            >
                                                {item.locked ? '🔒' : '🔓'}
                                            </button>
                                        )}
                                        {userCanWrite && (
                                            <button
                                                className={`todo-calendar-btn ${item.calendarSynced ? 'synced' : ''}`}
                                                onClick={() => handleToggleCalendar(item)}
                                                title={item.calendarSynced ? '캘린더에서 제거' : '날짜를 선택하여 캘린더에 추가'}
                                                disabled={item.locked}
                                            >
                                                {item.calendarSynced ? '📅✓' : '📅'}
                                            </button>
                                        )}
                                        {userCanWrite && (
                                            <button
                                                className="todo-delete-btn"
                                                onClick={() => handleDeleteItem(item.id)}
                                                title="휴지통으로"
                                                disabled={item.locked}
                                            >
                                                🗑️
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* FAB - 체크리스트 탭에서만 표시 */}
            {userCanWrite && activeTab === 'checklist' && (
                <button className="fab" onClick={() => { setNewColor(null); setNewTitle(''); setNewContent(''); setNewDueDate(''); setNewLabels([]); setNewRepeatType('none'); setAddOptionSheet(null); setNewImages([]); setNewFiles([]); setShowAddModal(true); }} title="새 체크리스트">
                    +
                </button>
            )}

            {/* 체크리스트 추가 - 전체화면 에디터 */}
            {showAddModal && (
                <div className="fullscreen-editor">
                    <div className="fullscreen-editor-header">
                        <button className="fullscreen-editor-back" onClick={() => { newImages.forEach(img => URL.revokeObjectURL(img.preview)); setNewImages([]); setNewFiles([]); setAddOptionSheet(null); setShowAddModal(false); }}>←</button>
                        <div className="fullscreen-editor-actions">
                            <button className="btn btn-primary btn-sm" onClick={handleAddItem}>추가</button>
                        </div>
                    </div>

                    {/* 추가 모드 상단 툴바 */}
                    <div className="edit-toolbar">
                        <button
                            type="button"
                            className={`edit-toolbar-btn ${addOptionSheet === 'color' ? 'active' : ''}`}
                            onClick={() => setAddOptionSheet(addOptionSheet === 'color' ? null : 'color')}
                        >
                            <span>🏅</span><span className="edit-toolbar-label">중요도</span>
                            {newColor && <span className="edit-toolbar-dot" style={{ background: LABEL_COLORS.find(c => c.id === newColor)?.hex }}></span>}
                        </button>
                        <button
                            type="button"
                            className={`edit-toolbar-btn ${addOptionSheet === 'dueDate' ? 'active' : ''}`}
                            onClick={() => {
                                if (!effectiveLimits.priority) { setUpgradeReason('priority'); setShowUpgradeModal(true); return; }
                                setAddOptionSheet(addOptionSheet === 'dueDate' ? null : 'dueDate');
                            }}
                        >
                            <span>⏰</span><span className="edit-toolbar-label">마감일</span>
                            {newDueDate && <span className="edit-toolbar-dot" style={{ background: getDuePriority(new Date(newDueDate)).color }}></span>}
                        </button>
                        <button
                            type="button"
                            className={`edit-toolbar-btn ${addOptionSheet === 'label' ? 'active' : ''}`}
                            onClick={() => {
                                if (!effectiveLimits.labels) { setUpgradeReason('labels'); setShowUpgradeModal(true); return; }
                                setAddOptionSheet(addOptionSheet === 'label' ? null : 'label');
                            }}
                        >
                            <span>🏷️</span><span className="edit-toolbar-label">라벨</span>
                            {newLabels.length > 0 && <span className="edit-toolbar-count">{newLabels.length}</span>}
                        </button>
                        <button
                            type="button"
                            className={`edit-toolbar-btn ${addOptionSheet === 'repeat' ? 'active' : ''}`}
                            onClick={() => {
                                if (!effectiveLimits.repeat) { setUpgradeReason('repeat'); setShowUpgradeModal(true); return; }
                                setAddOptionSheet(addOptionSheet === 'repeat' ? null : 'repeat');
                            }}
                        >
                            <span>🔄</span><span className="edit-toolbar-label">반복</span>
                            {newRepeatType && newRepeatType !== 'none' && <span className="edit-toolbar-dot" style={{ background: '#6366f1' }}></span>}
                        </button>
                        <button
                            type="button"
                            className={`edit-toolbar-btn ${addOptionSheet === 'file' ? 'active' : ''}`}
                            onClick={() => setAddOptionSheet(addOptionSheet === 'file' ? null : 'file')}
                            disabled={(newImages.length + newFiles.length) >= 5}
                        >
                            <span>📎</span><span className="edit-toolbar-label">파일</span>
                            {(newImages.length + newFiles.length) > 0 && <span className="edit-toolbar-count">{newImages.length + newFiles.length}</span>}
                        </button>
                    </div>
                    <input ref={addImageRef} type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (!file.type.startsWith('image/')) { addToast('이미지 파일만 추가할 수 있습니다.', 'error'); return; }
                            if (file.size > 5 * 1024 * 1024) { addToast('5MB 이하 이미지만 가능합니다.', 'error'); return; }
                            if ((newImages.length + newFiles.length) >= 5) { addToast('첨부파일은 최대 5개까지 가능합니다.', 'error'); return; }
                            setNewImages(prev => [...prev, { file, preview: URL.createObjectURL(file) }]);
                            e.target.value = '';
                        }}
                    />
                    <input ref={addDocRef} type="file" accept="*/*" style={{ display: 'none' }}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 5 * 1024 * 1024) { addToast('5MB 이하 파일만 가능합니다.', 'error'); return; }
                            if ((newImages.length + newFiles.length) >= 5) { addToast('첨부파일은 최대 5개까지 가능합니다.', 'error'); return; }
                            setNewFiles(prev => [...prev, file]);
                            e.target.value = '';
                        }}
                    />

                    {/* 옵션 시트: 중요도 */}
                    {addOptionSheet === 'color' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>🏅 중요도 선택</span>
                                <button type="button" onClick={() => setAddOptionSheet(null)}>✕</button>
                            </div>
                            <div className="filter-chips" style={{ flexWrap: 'wrap', gap: 'var(--spacing-xs)', padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                {LABEL_COLORS.map(c => (
                                    <button
                                        key={c.id}
                                        className={`filter-chip ${newColor === c.id ? 'active' : ''}`}
                                        onClick={() => setNewColor(newColor === c.id ? null : c.id)}
                                        type="button"
                                    >
                                        <span className="filter-chip-dot" style={{ background: c.hex }} />
                                        {c.name}
                                    </button>
                                ))}
                                <button
                                    className={`filter-chip ${newColor === null ? 'active' : ''}`}
                                    onClick={() => setNewColor(null)}
                                    type="button"
                                >
                                    <span className="filter-chip-dot" style={{ background: 'var(--color-bg)', border: '2px dashed var(--color-text-muted)' }} />
                                    무순위
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 옵션 시트: 마감일 */}
                    {addOptionSheet === 'dueDate' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>⏰ 마감일 설정</span>
                                <button type="button" onClick={() => setAddOptionSheet(null)}>✕</button>
                            </div>
                            <div style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                <input
                                    type="datetime-local"
                                    className="input-field"
                                    value={newDueDate}
                                    onChange={(e) => setNewDueDate(e.target.value)}
                                />
                                {newDueDate && (
                                    <div style={{ marginTop: 'var(--spacing-xs)', fontSize: 13 }}>
                                        {getDuePriority(new Date(newDueDate)).icon} {getDuePriority(new Date(newDueDate)).level > 0 ? `단계 ${getDuePriority(new Date(newDueDate)).level}` : ''}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 옵션 시트: 라벨 */}
                    {addOptionSheet === 'label' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>🏷️ 라벨 선택</span>
                                <button type="button" onClick={() => setAddOptionSheet(null)}>✕</button>
                            </div>
                            <div style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                <div className="label-selector">
                                    {(project?.projectLabels || []).map(label => (
                                        <button
                                            key={label}
                                            type="button"
                                            className={`priority-option ${newLabels.includes(label) ? 'active' : ''}`}
                                            onClick={() => {
                                                setNewLabels(prev =>
                                                    prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
                                                );
                                            }}
                                        >
                                            🏷️ {label}
                                            {userCanWrite && (
                                                <span style={{ marginLeft: 'var(--spacing-xs)', fontSize: 10, color: 'var(--color-danger)', cursor: 'pointer' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (confirm(`"${label}" 라벨을 삭제하시겠습니까?`)) {
                                                            setNewLabels(prev => prev.filter(l => l !== label));
                                                            removeProjectLabel(projectId, label).then(() => addToast(`라벨 "${label}" 삭제됨`, 'success'));
                                                        }
                                                    }}>×</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                                {userCanWrite && (
                                    <div style={{ display: 'flex', gap: 'var(--spacing-xs)', marginTop: 'var(--spacing-xs)' }}>
                                        <input type="text" className="input-field" placeholder="새 라벨"
                                            value={newLabel} onChange={e => setNewLabel(e.target.value)} style={{ flex: 1 }} />
                                        <button type="button" className="btn btn-primary btn-sm"
                                            disabled={!newLabel.trim()}
                                            onClick={async () => {
                                                await addProjectLabel(projectId, newLabel.trim());
                                                setNewLabel('');
                                                addToast('라벨 추가됨', 'success');
                                            }}>추가</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 옵션 시트: 반복 */}
                    {addOptionSheet === 'repeat' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>🔄 반복 설정</span>
                                <button type="button" onClick={() => setAddOptionSheet(null)}>✕</button>
                            </div>
                            <div style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                <div className="repeat-selector" style={{ flexWrap: 'wrap' }}>
                                    {[
                                        { v: 'none', l: '없음' },
                                        { v: 'daily', l: '매일', e: '🔄' },
                                        { v: 'weekly', l: '매주', e: '📅' },
                                        { v: 'monthly', l: '매달', e: '🗓️' },
                                    ].map(r => (
                                        <button
                                            key={r.v}
                                            type="button"
                                            className={`priority-option ${newRepeatType === r.v || (r.v === 'none' && !newRepeatType) ? 'active' : ''}`}
                                            onClick={() => {
                                                if (r.v !== 'none' && !effectiveLimits.repeat) { setUpgradeReason('repeat'); setShowUpgradeModal(true); return; }
                                                setNewRepeatType(r.v);
                                            }}
                                        >
                                            {r.e || ''} {r.l}
                                        </button>
                                    ))}
                                    <div className="repeat-dropdowns">
                                        <select
                                            className={`input-field${newRepeatType?.startsWith('weekday:') ? ' selected' : ''}`}
                                            style={{ padding: '4px 6px', fontSize: 'var(--font-size-xs)' }}
                                            value={newRepeatType?.startsWith('weekday:') ? newRepeatType : ''}
                                            onChange={(e) => setNewRepeatType(e.target.value || 'none')}
                                        >
                                            <option value="">매주 요일...</option>
                                            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                                                <option key={i} value={`weekday:${i}`}>매주 {d}요일</option>
                                            ))}
                                        </select>
                                        <select
                                            className={`input-field${newRepeatType?.startsWith('monthday:') ? ' selected' : ''}`}
                                            style={{ padding: '4px 6px', fontSize: 'var(--font-size-xs)' }}
                                            value={newRepeatType?.startsWith('monthday:') ? newRepeatType : ''}
                                            onChange={(e) => setNewRepeatType(e.target.value || 'none')}
                                        >
                                            <option value="">매달 일자...</option>
                                            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                                                <option key={d} value={`monthday:${d}`}>매달 {d}일</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 옵션 시트: 파일 첨부 */}
                    {addOptionSheet === 'file' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>📎 파일 첨부</span>
                                <button type="button" onClick={() => setAddOptionSheet(null)}>✕</button>
                            </div>
                            <div className="file-upload-sheet">
                                <button
                                    type="button"
                                    className="file-upload-btn"
                                    onClick={() => { addImageRef.current?.click(); setAddOptionSheet(null); }}
                                    disabled={(newImages.length + newFiles.length) >= 5}
                                >
                                    🖼️ 이미지 업로드
                                </button>
                                <button
                                    type="button"
                                    className="file-upload-btn"
                                    onClick={() => { addDocRef.current?.click(); setAddOptionSheet(null); }}
                                    disabled={(newImages.length + newFiles.length) >= 5}
                                >
                                    📄 서류 업로드
                                </button>
                                <p className="file-upload-hint">이미지+서류 합산 최대 5개, 각 5MB 이하</p>
                            </div>
                        </div>
                    )}

                    <div className="fullscreen-editor-body">
                        <input
                            type="text"
                            className="fullscreen-editor-title"
                            placeholder="제목을 입력하세요"
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            autoFocus
                        />
                        <textarea
                            className="fullscreen-editor-content"
                            placeholder="내용을 입력하세요"
                            value={newContent}
                            onChange={(e) => setNewContent(e.target.value)}
                        />
                        {/* 첨부 이미지 미리보기 */}
                        {newImages.length > 0 && (
                            <div className="edit-images-grid">
                                {newImages.map((img, i) => (
                                    <div key={i} className="edit-image-item">
                                        <img src={img.preview} alt={`첨부 ${i + 1}`} />
                                        <button
                                            type="button"
                                            className="edit-image-remove"
                                            onClick={() => {
                                                URL.revokeObjectURL(img.preview);
                                                setNewImages(prev => prev.filter((_, idx) => idx !== i));
                                            }}
                                        >×</button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {newFiles.length > 0 && (
                            <div className="edit-files-list" style={{ padding: '0 var(--spacing-md)' }}>
                                {newFiles.map((f, i) => (
                                    <div key={i} className="edit-file-item">
                                        <span className="file-name">📄 {f.name} ({(f.size / 1024).toFixed(0)}KB)</span>
                                        <button
                                            type="button"
                                            className="file-remove"
                                            onClick={() => setNewFiles(prev => prev.filter((_, idx) => idx !== i))}
                                        >×</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 아이템 수정 - 전체화면 에디터 (Google Keep 스타일) */}
            {
                showEditModal && editItem && (
                    <div className="fullscreen-editor">
                        <div className="fullscreen-editor-header">
                            <button
                                className="fullscreen-editor-back"
                                onClick={() => {
                                    // 업로드 중이면 경고 + 정리
                                    if (itemImageUploading || itemFileUploading) {
                                        if (window.confirm('파일 업로드가 진행 중입니다. 나가면 업로드된 파일이 삭제됩니다. 나가시겠습니까?')) {
                                            // 원본 대비 새로 추가된 이미지/파일 URL 정리
                                            const origImages = editItemOriginal?.images || [];
                                            const origFiles = (editItemOriginal?.files || []).map(f => f.url);
                                            const newImages = (editItem?.images || []).filter(url => !origImages.includes(url));
                                            const newFileUrls = (editItem?.files || []).filter(f => !origFiles.includes(f.url)).map(f => f.url);
                                            [...newImages, ...newFileUrls].forEach(url => deleteStorageFile(url));
                                            setShowEditModal(false); setEditItem(null); setEditItemOriginal(null); setIsEditingContent(false); setEditOptionSheet(null);
                                        }
                                        return;
                                    }
                                    // 수정사항이 있는지 확인
                                    if (isEditingContent && editItem && editItemOriginal) {
                                        const hasChanges = editItem.title !== editItemOriginal.title
                                            || (editItem.content || '') !== (editItemOriginal.content || '')
                                            || (editItem.color || null) !== (editItemOriginal.color || null)
                                            || JSON.stringify(editItem.images || []) !== JSON.stringify(editItemOriginal.images || [])
                                            || JSON.stringify(editItem.files || []) !== JSON.stringify(editItemOriginal.files || [])
                                            || (editItem.dueDate || null) !== (editItemOriginal.dueDate || null)
                                            || JSON.stringify(editItem.labels || []) !== JSON.stringify(editItemOriginal.labels || [])
                                            || (editItem.repeatType || null) !== (editItemOriginal.repeatType || null);
                                        if (hasChanges) {
                                            setShowUnsavedModal(true);
                                            return;
                                        }
                                    }
                                    setShowEditModal(false); setEditItem(null); setEditItemOriginal(null); setIsEditingContent(false); setEditOptionSheet(null);
                                }}
                            >←</button>
                            <div className="fullscreen-editor-actions">
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const isFav = favoriteItemSet.has(`${projectId}_${editItem.id}`);
                                        if (isFav) {
                                            if (window.confirm('즐겨찾기를 해제하시겠습니까?')) {
                                                removeFavoriteItem(profile.uid, projectId, editItem.id);
                                            }
                                        } else {
                                            addFavoriteItem(profile.uid, projectId, editItem.id, editItem.title, project?.name || '');
                                        }
                                    }}
                                    title="즐겨찾기"
                                >{favoriteItemSet.has(`${projectId}_${editItem.id}`) ? '⭐ 즐겨찾기' : '☆ 즐겨찾기'}</button>
                                {/* 구성원 체크 버튼 */}
                                {!isEditingContent && editItem && !editItem.locked && project?.members && (
                                    <div className="member-check-wrapper">
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => setShowMemberCheckDropdown(!showMemberCheckDropdown)}
                                            title="구성원 확인"
                                        >✅ 확인</button>
                                        {showMemberCheckDropdown && (
                                            <div className="member-check-dropdown">
                                                <div className="member-check-title">구성원 확인</div>
                                                {Object.entries(project.members).map(([uid, member]) => (
                                                    <label key={uid} className="member-check-item">
                                                        <input
                                                            type="checkbox"
                                                            checked={!!(editItem.memberChecks && editItem.memberChecks[uid])}
                                                            onChange={() => handleMemberCheckToggle(editItem, uid)}
                                                        />
                                                        <span className="member-check-name">{getMemberName(uid) || member.nickname}</span>
                                                        <span className="member-check-role">{getRoleLabel(member.role)}</span>
                                                    </label>
                                                ))}
                                                {(() => {
                                                    const memberUIDs = Object.keys(project.members);
                                                    const checkedCount = memberUIDs.filter(uid => editItem.memberChecks?.[uid]).length;
                                                    return (
                                                        <div className="member-check-summary">
                                                            {checkedCount}/{memberUIDs.length}명 확인
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {!isEditingContent && editItem && !editItem.locked && (
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => { setIsEditingContent(true); setEditOptionSheet(null); }}
                                        title="편집"
                                    >✏️ 편집</button>
                                )}
                                {isEditingContent && (
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => {
                                            if (itemImageUploading || itemFileUploading) {
                                                addToast('파일 업로드가 진행 중입니다. 완료 후 저장해주세요.', 'warning');
                                                return;
                                            }
                                            handleEditItem(); setIsEditingContent(false); setEditOptionSheet(null);
                                        }}
                                        disabled={itemImageUploading || itemFileUploading}
                                    >{(itemImageUploading || itemFileUploading) ? '⏳ 업로드 중...' : '💾 저장'}</button>
                                )}
                            </div>
                        </div>

                        {/* 편집 모드 상단 툴바 (헤더 아래) */}
                        {isEditingContent && (
                            <div className="edit-toolbar">
                                <button
                                    type="button"
                                    className={`edit-toolbar-btn ${editOptionSheet === 'color' ? 'active' : ''}`}
                                    onClick={() => setEditOptionSheet(editOptionSheet === 'color' ? null : 'color')}
                                >
                                    <span>🏅</span><span className="edit-toolbar-label">중요도</span>
                                    {editItem.color && <span className="edit-toolbar-dot" style={{ background: LABEL_COLORS.find(c => c.id === editItem.color)?.hex }}></span>}
                                </button>
                                <button
                                    type="button"
                                    className={`edit-toolbar-btn ${editOptionSheet === 'dueDate' ? 'active' : ''}`}
                                    onClick={() => {
                                        if (!effectiveLimits.priority) { setUpgradeReason('priority'); setShowUpgradeModal(true); return; }
                                        setEditOptionSheet(editOptionSheet === 'dueDate' ? null : 'dueDate');
                                    }}
                                >
                                    <span>⏰</span><span className="edit-toolbar-label">마감일</span>
                                    {editItem.dueDate && <span className="edit-toolbar-dot" style={{ background: getDuePriority(editItem.dueDate).color }}></span>}
                                </button>
                                <button
                                    type="button"
                                    className={`edit-toolbar-btn ${editOptionSheet === 'label' ? 'active' : ''}`}
                                    onClick={() => {
                                        if (!effectiveLimits.labels) { setUpgradeReason('labels'); setShowUpgradeModal(true); return; }
                                        setEditOptionSheet(editOptionSheet === 'label' ? null : 'label');
                                    }}
                                >
                                    <span>🏷️</span><span className="edit-toolbar-label">라벨</span>
                                    {(editItem.labels || []).length > 0 && <span className="edit-toolbar-count">{(editItem.labels || []).length}</span>}
                                </button>
                                <button
                                    type="button"
                                    className={`edit-toolbar-btn ${editOptionSheet === 'repeat' ? 'active' : ''}`}
                                    onClick={() => {
                                        if (!effectiveLimits.repeat) { setUpgradeReason('repeat'); setShowUpgradeModal(true); return; }
                                        setEditOptionSheet(editOptionSheet === 'repeat' ? null : 'repeat');
                                    }}
                                >
                                    <span>🔄</span><span className="edit-toolbar-label">반복</span>
                                    {editItem.repeatType && editItem.repeatType !== 'none' && <span className="edit-toolbar-dot" style={{ background: '#6366f1' }}></span>}
                                </button>
                                {/* 📎 파일 첨부 버튼 — 플랜 제한 없음 */}
                                <button
                                    type="button"
                                    className={`edit-toolbar-btn ${editOptionSheet === 'file' ? 'active' : ''}`}
                                    onClick={() => setEditOptionSheet(editOptionSheet === 'file' ? null : 'file')}
                                    disabled={itemImageUploading || itemFileUploading || ((editItem.images || []).length + (editItem.files || []).length) >= 5}
                                >
                                    <span>{(itemImageUploading || itemFileUploading) ? '⏳' : '📎'}</span><span className="edit-toolbar-label">파일</span>
                                    {((editItem.images || []).length + (editItem.files || []).length) > 0 && <span className="edit-toolbar-count">{(editItem.images || []).length + (editItem.files || []).length}/5</span>}
                                </button>
                                <input
                                    ref={editItemImageRef}
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={handleItemImageAdd}
                                />
                                <input
                                    ref={editItemDocRef}
                                    type="file"
                                    accept="*/*"
                                    style={{ display: 'none' }}
                                    onChange={handleItemFileAdd}
                                />
                            </div>
                        )}

                        {/* 옵션 시트: 중요도 */}
                        {editOptionSheet === 'color' && (
                            <div className="edit-option-sheet">
                                <div className="edit-option-sheet-header">
                                    <span>🏅 중요도 선택</span>
                                    <button type="button" onClick={() => setEditOptionSheet(null)}>✕</button>
                                </div>
                                <div className="filter-chips" style={{ flexWrap: 'wrap', gap: 'var(--spacing-xs)', padding: 'var(--spacing-sm) 0' }}>
                                    {LABEL_COLORS.map(c => (
                                        <button
                                            key={c.id}
                                            className={`filter-chip ${editItem.color === c.id ? 'active' : ''}`}
                                            onClick={() => setEditItem({ ...editItem, color: editItem.color === c.id ? null : c.id })}
                                            type="button"
                                        >
                                            <span className="filter-chip-dot" style={{ background: c.hex }} />
                                            {c.name}
                                        </button>
                                    ))}
                                    <button
                                        className={`filter-chip ${!editItem.color ? 'active' : ''}`}
                                        onClick={() => setEditItem({ ...editItem, color: null })}
                                        type="button"
                                    >
                                        <span className="filter-chip-dot" style={{ background: 'var(--color-bg)', border: '2px dashed var(--color-text-muted)' }} />
                                        무순위
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 옵션 시트: 마감일 */}
                        {editOptionSheet === 'dueDate' && (
                            <div className="edit-option-sheet">
                                <div className="edit-option-sheet-header">
                                    <span>⏰ 마감일 설정</span>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <button type="button" className="edit-help-btn" onClick={() => setShowDueHelp(true)} title="도움말">❓</button>
                                        <button type="button" onClick={() => setEditOptionSheet(null)}>✕</button>
                                    </div>
                                </div>
                                <div style={{ padding: '8px 16px 16px' }}>
                                    <input
                                        type="datetime-local"
                                        className="input-field"
                                        value={toLocalDatetime(editItem.dueDate)}
                                        onChange={(e) => setEditItem({ ...editItem, dueDate: e.target.value ? Timestamp.fromDate(new Date(e.target.value)) : null })}
                                    />
                                    {editItem.dueDate && (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                                            <span>{getDuePriority(editItem.dueDate).icon} 단계 {getDuePriority(editItem.dueDate).level}</span>
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditItem({ ...editItem, dueDate: null })}>삭제</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 옵션 시트: 라벨 */}
                        {editOptionSheet === 'label' && (
                            <div className="edit-option-sheet">
                                <div className="edit-option-sheet-header">
                                    <span>🏷️ 라벨 선택</span>
                                    <button type="button" onClick={() => setEditOptionSheet(null)}>✕</button>
                                </div>
                                <div className="label-selector" style={{ padding: '8px 16px 16px' }}>
                                    {(project?.projectLabels || []).map(label => (
                                        <button
                                            key={label}
                                            type="button"
                                            className={`priority-option ${(editItem.labels || []).includes(label) ? 'active' : ''}`}
                                            onClick={() => {
                                                const cur = editItem.labels || [];
                                                setEditItem({
                                                    ...editItem,
                                                    labels: cur.includes(label) ? cur.filter(l => l !== label) : [...cur, label]
                                                });
                                            }}
                                        >
                                            🏷️ {label}
                                            {userCanWrite && (
                                                <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--color-danger)', cursor: 'pointer' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (confirm(`"${label}" 라벨을 삭제하시겠습니까?`)) {
                                                            setEditItem(prev => ({ ...prev, labels: (prev.labels || []).filter(l => l !== label) }));
                                                            removeProjectLabel(projectId, label).then(() => addToast(`라벨 "${label}" 삭제됨`, 'success'));
                                                        }
                                                    }}>×</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                                {userCanWrite && (
                                    <div style={{ display: 'flex', gap: 6, padding: '0 16px 16px' }}>
                                        <input type="text" className="input-field" placeholder="새 라벨"
                                            value={newLabel} onChange={e => setNewLabel(e.target.value)} style={{ flex: 1 }} />
                                        <button type="button" className="btn btn-primary btn-sm"
                                            disabled={!newLabel.trim()}
                                            onClick={async () => {
                                                if (!effectiveLimits.labels) { setUpgradeReason('labels'); setShowUpgradeModal(true); return; }
                                                await addProjectLabel(projectId, newLabel.trim());
                                                setNewLabel('');
                                                addToast('라벨 추가됨', 'success');
                                            }}>추가</button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 옵션 시트: 반복 */}
                        {editOptionSheet === 'repeat' && (
                            <div className="edit-option-sheet">
                                <div className="edit-option-sheet-header">
                                    <span>🔄 반복 설정</span>
                                    <button type="button" onClick={() => setEditOptionSheet(null)}>✕</button>
                                </div>
                                <div style={{ padding: '8px 16px 16px' }}>
                                    <div className="repeat-selector">
                                        {[
                                            { v: 'none', l: '없음' },
                                            { v: 'daily', l: '매일', e: '🔄' },
                                            { v: 'weekly', l: '매주', e: '📅' },
                                            { v: 'monthly', l: '매달', e: '🗓️' },
                                        ].map(r => (
                                            <button
                                                key={r.v}
                                                type="button"
                                                className={`priority-option ${(editItem.repeatType || 'none') === r.v ? 'active' : ''}`}
                                                onClick={() => setEditItem({ ...editItem, repeatType: r.v === 'none' ? null : r.v })}
                                            >
                                                {r.e || ''} {r.l}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="repeat-advanced" style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                                        <select
                                            className="input-field"
                                            style={{ flex: 1 }}
                                            value={(editItem.repeatType || '').startsWith('weekday:') ? editItem.repeatType : ''}
                                            onChange={(e) => setEditItem({ ...editItem, repeatType: e.target.value || null })}
                                        >
                                            <option value="">특정 요일...</option>
                                            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                                                <option key={i} value={`weekday:${i}`}>매주 {d}요일</option>
                                            ))}
                                        </select>
                                        <select
                                            className="input-field"
                                            style={{ flex: 1 }}
                                            value={(editItem.repeatType || '').startsWith('monthday:') ? editItem.repeatType : ''}
                                            onChange={(e) => setEditItem({ ...editItem, repeatType: e.target.value || null })}
                                        >
                                            <option value="">특정 일...</option>
                                            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                                                <option key={d} value={`monthday:${d}`}>매달 {d}일</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 옵션 시트: 파일 첨부 */}
                        {editOptionSheet === 'file' && (
                            <div className="edit-option-sheet">
                                <div className="edit-option-sheet-header">
                                    <span>📎 파일 첨부</span>
                                    <button type="button" onClick={() => setEditOptionSheet(null)}>✕</button>
                                </div>
                                <div className="file-upload-sheet">
                                    <button
                                        type="button"
                                        className="file-upload-btn"
                                        onClick={() => { editItemImageRef.current?.click(); setEditOptionSheet(null); }}
                                        disabled={itemImageUploading || itemFileUploading || ((editItem.images || []).length + (editItem.files || []).length) >= 5}
                                    >
                                        🖼️ 이미지 업로드
                                    </button>
                                    <button
                                        type="button"
                                        className="file-upload-btn"
                                        onClick={() => { editItemDocRef.current?.click(); setEditOptionSheet(null); }}
                                        disabled={itemImageUploading || itemFileUploading || ((editItem.images || []).length + (editItem.files || []).length) >= 5}
                                    >
                                        📄 서류 업로드
                                    </button>
                                    <p className="file-upload-hint">이미지+서류 합산 최대 5개, 각 5MB 이하</p>
                                </div>
                            </div>
                        )}

                        <div className="fullscreen-editor-body">
                            {isEditingContent ? (
                                <>
                                    <input
                                        type="text"
                                        className="fullscreen-editor-title"
                                        placeholder="제목"
                                        value={editItem.title}
                                        onChange={(e) => setEditItem({ ...editItem, title: e.target.value })}
                                    />
                                    <textarea
                                        className="fullscreen-editor-content"
                                        placeholder="메모"
                                        value={editItem.content || ''}
                                        onChange={(e) => setEditItem({ ...editItem, content: e.target.value })}
                                    />
                                    {/* 첨부 이미지 목록 (편집 모드) */}
                                    {(editItem.images || []).length > 0 && (
                                        <div className="edit-images-grid">
                                            {editItem.images.map((url, i) => (
                                                <div key={i} className="edit-image-item">
                                                    <img src={url} alt={`첨부 ${i + 1}`} onClick={() => setViewerImage(url)} />
                                                    <button
                                                        type="button"
                                                        className="edit-image-remove"
                                                        onClick={() => handleItemImageRemove(i)}
                                                    >×</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {/* 첨부 파일 목록 (편집 모드) */}
                                    {(editItem.files || []).length > 0 && (
                                        <div className="edit-files-list">
                                            {(editItem.files || []).map((f, i) => (
                                                <div key={i} className="edit-file-item">
                                                    <span className="file-name">📄 {f.name}</span>
                                                    <span className="file-size">{formatFileSize(f.size)}</span>
                                                    <button type="button" className="file-remove" onClick={() => handleItemFileRemove(i)}>×</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <h2 className="fullscreen-editor-title" style={{ border: 'none', cursor: 'default' }}>
                                        {editItem.title}
                                    </h2>
                                    <div className="fullscreen-editor-content-view">
                                        {editItem.content ? renderContentWithLinks(editItem.content) : (
                                            <p style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>내용이 없습니다. ✏️ 편집 버튼을 눌러 내용을 추가하세요.</p>
                                        )}
                                        {/* 첨부 이미지 (읽기 모드) */}
                                        {(editItem.images || []).length > 0 && (
                                            <div className="edit-images-grid" style={{ marginTop: 12 }}>
                                                {editItem.images.map((url, i) => (
                                                    <div key={i} className="edit-image-item">
                                                        <img src={url} alt={`첨부 ${i + 1}`} onClick={() => setViewerImage(url)} />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {/* 첨부 파일 (읽기 모드) */}
                                        {(editItem.files || []).length > 0 && (
                                            <div className="edit-files-list" style={{ marginTop: 8 }}>
                                                {(editItem.files || []).map((f, i) => (
                                                    <span key={i} className="todo-file-link" onClick={() => downloadFile(f.url, f.name || `파일_${i + 1}`)}>
                                                        📄 {f.name} ({formatFileSize(f.size)})
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                    </div>
                )
            }

            {/* 버전 충돌 모달 */}
            {
                conflictData && (
                    <div className="inline-calendar-overlay" onClick={() => setConflictData(null)}>
                        <div className="conflict-modal" onClick={(e) => e.stopPropagation()}>
                            <h3 className="conflict-modal-title">⚠️ 수정 충돌 발생</h3>
                            <p className="conflict-modal-desc">
                                다른 사용자가 이 항목을 먼저 수정했습니다.<br />
                                어떻게 처리하시겠습니까?
                            </p>
                            <div className="conflict-compare">
                                <div className="conflict-section">
                                    <h4 className="conflict-section-title">📄 서버 (현재 저장된 내용)</h4>
                                    <div className="conflict-section-content">
                                        <strong>{conflictData.serverData.title}</strong>
                                        <p>{conflictData.serverData.content || '(내용 없음)'}</p>
                                    </div>
                                </div>
                                <div className="conflict-section">
                                    <h4 className="conflict-section-title">✏️ 내 수정사항</h4>
                                    <div className="conflict-section-content">
                                        <strong>{conflictData.myData.title}</strong>
                                        <p>{conflictData.myData.content || '(내용 없음)'}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="conflict-actions">
                                <button className="btn btn-danger btn-sm" onClick={handleConflictOverwrite}>
                                    덮어쓰기
                                </button>
                                <button className="btn btn-primary btn-sm" onClick={handleConflictSaveAsNew}>
                                    다른이름 저장
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={handleConflictCancel}>
                                    취소
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 초대 모달 */}
            <Modal
                isOpen={showInviteModal}
                onClose={() => setShowInviteModal(false)}
                title="멤버 초대"
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setShowInviteModal(false)}>취소</button>
                        <button className="btn btn-primary" onClick={handleInvite} disabled={inviting}>
                            {inviting ? <span className="spinner"></span> : '초대'}
                        </button>
                    </>
                }
            >
                <form onSubmit={handleInvite}>
                    <div className="input-group">
                        <label className="input-label">닉네임 또는 이메일</label>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="닉네임 또는 이메일 주소"
                            value={inviteNickname}
                            onChange={(e) => setInviteNickname(e.target.value)}
                        />
                    </div>
                    <div className="input-group">
                        <label className="input-label">권한</label>
                        <select
                            className="input-field"
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value)}
                        >
                            <option value="editor">✏️ 편집자</option>
                            {effectiveLimits.viewerRole && <option value="viewer">👁️ 뷰어</option>}
                        </select>
                    </div>
                </form>
            </Modal>

            {/* 페이지 설정 전체화면 */}
            {showSettingsModal && (
                <div className="fullscreen-editor">
                    <div className="fullscreen-editor-header">
                        <button
                            className="fullscreen-editor-back"
                            onClick={() => setShowSettingsModal(false)}
                        >←</button>
                        <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>⚙️ 페이지 설정</h2>
                        <div style={{ width: 40 }} />
                    </div>
                    <div className="fullscreen-editor-body">
                        <div className="settings-section">
                            <h3 className="settings-section-title">멤버 ({members.length}명)</h3>
                            <div className="member-list">
                                {members.map(([userId, member]) => (
                                    <div key={userId} className="member-item">
                                        <div className="member-info">
                                            <span className="member-nickname">{getMemberName(userId) || member.nickname}</span>
                                            <span className={`badge badge-${member.role === 'admin' ? 'primary' : 'success'}`}>
                                                {getRoleLabel(member.role)}
                                            </span>
                                            {project?.useDisplayName && userId === profile?.uid && (
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ marginLeft: '4px', fontSize: 'var(--font-size-xs)', padding: '2px 6px' }}
                                                    onClick={() => { setMyDisplayNameInput(member.displayName || ''); setShowDisplayNamePrompt(true); }}
                                                >📛 활동명 변경</button>
                                            )}
                                        </div>
                                        {userCanAdmin && userId !== profile?.uid && (
                                            <div className="member-actions">
                                                <select
                                                    className="input-field"
                                                    style={{ width: 'auto', padding: '4px 8px', fontSize: 'var(--font-size-xs)' }}
                                                    value={member.role}
                                                    onChange={(e) => handleChangeRole(userId, e.target.value)}
                                                >
                                                    <option value="editor">✏️ 편집자</option>
                                                    <option value="viewer">👁️ 독자</option>
                                                </select>
                                                <button
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleRemoveMember(userId, getMemberName(userId) || member.nickname)}
                                                >
                                                    내보내기
                                                </button>
                                            </div>
                                        )}
                                        {/* 캘린더 공유 버튼 (관리자: 공유/해제, 비관리자: 요청 표시) */}
                                        {userId !== profile?.uid && myCalendarId && (
                                            userCanAdmin ? (
                                                <button
                                                    className={`btn btn-sm ${calendarSharedMembers[userId] === true ? 'btn-success' : calendarSharedMembers[userId] === 'pending' ? 'btn-warning' : calendarShareRequested[userId] ? 'btn-warning' : 'btn-secondary'}`}
                                                    style={{ marginLeft: '4px', fontSize: 'var(--font-size-xs)', minWidth: '32px' }}
                                                    onClick={() => handleToggleCalendarShare(userId, member)}
                                                    disabled={sharingCalendar[userId]}
                                                    title={calendarSharedMembers[userId] === true ? '캘린더 공유 해제' : calendarSharedMembers[userId] === 'pending' ? '참여 대기 중 - 클릭하여 해제' : calendarShareRequested[userId] ? '공유 요청됨 - 클릭하여 공유' : '캘린더 공유'}
                                                >
                                                    {sharingCalendar[userId] ? '⏳' : calendarSharedMembers[userId] === true ? '📅✅' : calendarSharedMembers[userId] === 'pending' ? '📅⏳' : calendarShareRequested[userId] ? '📅❗' : '📅'}
                                                </button>
                                            ) : (
                                                !calendarSharedMembers[profile?.uid] && null
                                            )
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 보기 설정 */}
                        <div className="settings-section">
                            <h3 className="settings-section-title">⚙️ 보기 설정</h3>
                            <div className="settings-row">
                                <span>마감일 표시 형식</span>
                                <select
                                    className="input-field"
                                    style={{ width: 'auto', padding: 'var(--spacing-xs) var(--spacing-sm)', fontSize: 'var(--font-size-xs)' }}
                                    value={dueDisplayMode}
                                    onChange={(e) => {
                                        setDueDisplayMode(e.target.value);
                                        localStorage.setItem('dueDisplayMode', e.target.value);
                                    }}
                                >
                                    <option value="date">📅 마감일 (월.일 / 시:분)</option>
                                    <option value="remaining">⏳ 남은 시간</option>
                                </select>
                            </div>
                        </div>


                        {/* 구글 캘린더 연동 */}
                        <div className="settings-section">
                            {userCanAdmin ? (
                                <>
                                    <h3 className="settings-section-title">📅 구글 캘린더 연동</h3>
                                    <p className="settings-description">
                                        <strong>팀 공유 캘린더</strong>를 사용하려면 캘린더 ID를 입력.<br />
                                        팀 공유 캘린더를 사용하지 않으면 <strong>개인 캘린더</strong>를 사용.
                                    </p>
                                    <div className="input-group" style={{ marginBottom: '8px' }}>
                                        <label className="input-label" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>📋 캘린더 ID</label>
                                        <input
                                            type="text"
                                            className="input-field"
                                            placeholder="연동할 캘린더 ID를 입력하세요 (예: abc@gmail.com)"
                                            value={calendarId}
                                            onChange={(e) => setCalendarId(e.target.value)}
                                            disabled={!calendarIdEditing}
                                            style={{ opacity: calendarIdEditing ? 1 : 0.6 }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                        {calendarIdEditing ? (
                                            <>
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={handleSaveCalendarId}
                                                    disabled={savingCalendar}
                                                >
                                                    {savingCalendar ? <span className="spinner"></span> : '💾 저장'}
                                                </button>
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => {
                                                        setCalendarId(myCalendarId || '');
                                                        setCalendarIdEditing(false);
                                                    }}
                                                >취소</button>
                                            </>
                                        ) : (
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => setCalendarIdEditing(true)}
                                            >✏️ 편집</button>
                                        )}
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => setShowCalendarHelp(!showCalendarHelp)}
                                        >
                                            {showCalendarHelp ? '도움말 접기' : '📌 도움말'}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                </>
                            )}

                            {/* 팀 캘린더 상태 안내 */}
                            {myCalendarId && (
                                <div style={{ marginTop: '12px', padding: '10px 12px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 18 }}>{calendarSharedMembers[profile?.uid] === true ? '✅' : '📅'}</span>
                                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                                        {userCanAdmin
                                            ? <>팀 공유 캘린더 <strong style={{ color: 'var(--color-primary)' }}>"{teamCalendarName || myCalendarId}"</strong>를 공유합니다. 필요시 멤버에게 공유하세요.</>
                                            : calendarSharedMembers[profile?.uid] === true
                                                ? <>팀 공유 캘린더 <strong style={{ color: 'var(--color-primary)' }}>"{teamCalendarName || myCalendarId}"</strong>를 공유받았습니다.</>
                                                : <>팀 캘린더가 설정되어 있습니다. 필요시 관리자에게 공유를 요청하세요. 현재 개인 캘린더를 사용중입니다.</>
                                        }
                                    </div>
                                </div>
                            )}

                            {/* 캘린더 공유요청 (비관리자 + 공유 미적용) */}
                            {!userCanAdmin && myCalendarId && !calendarSharedMembers[profile?.uid] && (
                                <div style={{ marginTop: '12px' }}>
                                    <button
                                        className={`btn btn-block ${calendarShareRequested[profile?.uid] ? 'btn-secondary' : 'btn-primary'}`}
                                        onClick={handleRequestCalendarShare}
                                        disabled={requestingShare || calendarShareRequested[profile?.uid]}
                                    >
                                        {requestingShare ? <span className="spinner"></span> : calendarShareRequested[profile?.uid] ? '요청완료' : '📅 캘린더 공유요청'}
                                    </button>
                                </div>
                            )}

                            {showCalendarHelp && userCanAdmin && (
                                <div className="calendar-help" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: '14px', marginTop: '4px' }}>

                                    {/* 캘린더 설정 (관리자용) */}
                                    <h4 style={{ fontSize: 'var(--font-size-sm)', marginBottom: '6px', color: 'var(--color-primary)' }}>🔧 팀 캘린더 설정</h4>
                                    <ol style={{ paddingLeft: '20px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: '1.8', marginBottom: 0 }}>
                                        <li><span style={{ color: 'var(--color-primary)', cursor: 'pointer', textDecoration: 'underline' }} onClick={(e) => { e.preventDefault(); window.open('https://calendar.google.com', '_system'); }}>calendar.google.com</span> 접속 <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>(웹브라우저)</span></li>
                                        <li>왼쪽 사이드바에서 공유할 캘린더의 <strong>⋮ → 설정 및 공유</strong></li>
                                        <li><strong>캘린더 통합</strong> 섹션에서 <strong>캘린더 ID</strong> 복사</li>
                                        <li><strong>✏️ 편집</strong> 버튼을 눌러 입력란에 붙여넣고 <strong>💾 저장</strong></li>
                                    </ol>

                                    <h4 style={{ fontSize: 'var(--font-size-sm)', marginTop: '14px', marginBottom: '6px', color: 'var(--color-primary)' }}>👥 멤버에게 캘린더 공유하기</h4>
                                    <ol style={{ paddingLeft: '20px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: '1.8', marginBottom: 0 }}>
                                        <li>위 멤버 목록에서 각 멤버 옆 <strong>📅 버튼</strong> 클릭</li>
                                        <li>멤버에게 공유 초대 메일이 자동 발송됩니다</li>
                                        <li>멤버가 메일에서 <strong>수락</strong>하면 공유 완료 (📅✅)</li>
                                    </ol>

                                </div>
                            )}
                        </div>


                        {/* 페이지 나가기 (비관리자만 표시) */}
                        {!userCanAdmin && (
                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
                                <button
                                    className="btn btn-danger"
                                    style={{ width: '100%' }}
                                    onClick={handleLeaveProject}
                                >
                                    🚪 페이지 나가기
                                </button>
                                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 6, textAlign: 'center' }}>
                                    나가면 관리자가 다시 초대해야 참여할 수 있습니다.
                                </p>
                            </div>
                        )}

                        {/* 페이지 삭제 (관리자만 표시) */}
                        {userCanAdmin && (
                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
                                <button
                                    className="btn btn-danger"
                                    style={{ width: '100%' }}
                                    onClick={handleDeleteProject}
                                >
                                    🗑️ 페이지 삭제
                                </button>
                                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 6, textAlign: 'center' }}>
                                    모든 데이터가 영구적으로 삭제됩니다.
                                </p>
                            </div>
                        )}

                    </div>
                </div>
            )}

            {/* 날짜 선택 모달 (인라인 달력) */}
            {
                showDatePicker && calendarTargetItem && (
                    <div className="inline-calendar-overlay" onClick={() => { setShowDatePicker(false); setCalendarTargetItem(null); }}>
                        <div className="inline-calendar-popup" onClick={(e) => e.stopPropagation()}>
                            {addingToCalendar ? (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
                                    <span className="spinner"></span>
                                    <span style={{ marginLeft: '8px', color: 'var(--color-text-secondary)' }}>등록 중...</span>
                                </div>
                            ) : (
                                <InlineCalendar
                                    initialDate={new Date()}
                                    onConfirm={(dateStr) => handleCalendarDateSelect(dateStr)}
                                    onCancel={() => { setShowDatePicker(false); setCalendarTargetItem(null); }}
                                    calendarList={pickerCalendarList}
                                    selectedCalendar={pickerCalendarId}
                                    onCalendarChange={(val) => { setPickerCalendarId(val); localStorage.setItem('lastSelectedCalendarId', val); }}
                                    loadingCalendars={loadingPickerCalendars}
                                />
                            )}
                        </div>
                    </div>
                )
            }

            {/* DM(직접 메시지) 모달 */}
            <Modal
                isOpen={showChatDm}
                onClose={() => { setShowChatDm(false); setChatDmRecipient(''); setChatDmMessage(''); setChatDmSearchResult(null); }}
                title="메시지 보내기"
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => { setShowChatDm(false); setChatDmRecipient(''); setChatDmMessage(''); setChatDmSearchResult(null); }}>
                            취소
                        </button>
                        <button
                            className="btn btn-primary"
                            disabled={!chatDmSearchResult || !chatDmMessage.trim() || chatDmSending}
                            onClick={async () => {
                                if (!chatDmSearchResult || !chatDmMessage.trim()) return;
                                setChatDmSending(true);
                                try {
                                    await sendDirectMessage(profile.uid, chatDmSearchResult.id, chatDmMessage.trim());
                                    addToast('메시지를 보냈습니다', 'success');
                                    setShowChatDm(false);
                                    setChatDmRecipient(''); setChatDmMessage(''); setChatDmSearchResult(null);
                                } catch (e) {
                                    addToast('전송에 실패했습니다.', 'error');
                                }
                                setChatDmSending(false);
                            }}
                        >
                            {chatDmSending ? '전송 중...' : '보내기'}
                        </button>
                    </>
                }
            >
                <div className="input-group">
                    <label className="input-label">📧 받는 사람 (이메일 또는 닉네임)</label>
                    <div className="friend-name-row" style={{ gap: 'var(--spacing-sm)' }}>
                        <input
                            className="input-field"
                            placeholder="이메일 또는 닉네임을 입력하세요"
                            value={chatDmRecipient}
                            onChange={(e) => { setChatDmRecipient(e.target.value); setChatDmSearchResult(null); }}
                            style={{ flex: 1 }}
                        />
                        <button
                            className="btn btn-primary btn-sm"
                            disabled={!chatDmRecipient.trim() || chatDmSearching}
                            onClick={async () => {
                                if (!chatDmRecipient.trim()) return;
                                setChatDmSearching(true);
                                const user = await findUserByNicknameOrEmail(chatDmRecipient.trim());
                                if (user && user.id === profile.uid) {
                                    setChatDmSearchResult(null);
                                    addToast('자기 자신에게는 메시지를 보낼 수 없습니다.', 'error');
                                } else {
                                    setChatDmSearchResult(user);
                                    if (!user) addToast('사용자를 찾을 수 없습니다.', 'error');
                                }
                                setChatDmSearching(false);
                            }}
                        >
                            {chatDmSearching ? '...' : '검색'}
                        </button>
                        {chatDmSearchResult && (
                            <button
                                className="btn btn-sm"
                                style={{ fontSize: 'var(--font-size-md)', padding: '2px 8px', minWidth: 'auto' }}
                                onClick={() => {
                                    const isFav = chatFavFriends.some(f => f.friendUid === chatDmSearchResult.id);
                                    if (isFav) {
                                        if (window.confirm('즐겨찾기를 해제하시겠습니까?')) removeFavoriteFriend(profile.uid, chatDmSearchResult.id);
                                    } else {
                                        addFavoriteFriend(profile.uid, chatDmSearchResult.id, chatDmSearchResult.nickname);
                                        addToast('친구 즐겨찾기에 추가했습니다.', 'success');
                                    }
                                }}
                                title="친구 즐겨찾기"
                            >
                                {chatFavFriends.some(f => f.friendUid === chatDmSearchResult.id) ? '⭐' : '☆'}
                            </button>
                        )}
                    </div>
                    {chatDmSearchResult && (
                        <div className="card" style={{ marginTop: 'var(--spacing-sm)', padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                            <strong>{chatDmSearchResult.nickname}</strong>
                            {chatDmRecipient.includes('@') && (
                                <span style={{ color: 'var(--color-text-secondary)', marginLeft: 'var(--spacing-sm)', fontSize: 'var(--font-size-sm)' }}>
                                    {chatDmSearchResult.email}
                                </span>
                            )}
                        </div>
                    )}
                </div>
                <div className="input-group" style={{ marginTop: 'var(--spacing-md)' }}>
                    <label className="input-label">💬 메시지</label>
                    <textarea
                        className="input-field"
                        placeholder="메시지를 입력하세요"
                        value={chatDmMessage}
                        onChange={(e) => setChatDmMessage(e.target.value)}
                        rows={4}
                        style={{ resize: 'vertical' }}
                    />
                </div>
            </Modal>

            {/* 수정사항 저장 확인 모달 */}
            {
                showUnsavedModal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                    }}>
                        <div style={{
                            background: 'var(--color-bg-elevated, #fff)', borderRadius: 'var(--radius-lg, 12px)',
                            padding: 'var(--spacing-lg, 24px)', maxWidth: '320px', width: '90%',
                            boxShadow: 'var(--shadow-lg)', textAlign: 'center',
                        }}>
                            <p style={{ fontSize: 'var(--font-size-md, 16px)', fontWeight: 600, marginBottom: '8px', color: 'var(--color-text)' }}>
                                수정사항이 있습니다.
                            </p>
                            <p style={{ fontSize: 'var(--font-size-sm, 14px)', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
                                저장하시겠습니까?
                            </p>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    className="btn btn-secondary"
                                    style={{ flex: 1 }}
                                    onClick={() => {
                                        setShowUnsavedModal(false);
                                        setShowEditModal(false); setEditItem(null); setEditItemOriginal(null); setIsEditingContent(false); setEditOptionSheet(null);
                                    }}
                                >나가기</button>
                                <button
                                    className="btn btn-secondary"
                                    style={{ flex: 1 }}
                                    onClick={() => setShowUnsavedModal(false)}
                                >취소</button>
                                <button
                                    className="btn btn-primary"
                                    style={{ flex: 1 }}
                                    onClick={() => {
                                        setShowUnsavedModal(false);
                                        handleEditItem();
                                        setIsEditingContent(false);
                                    }}
                                >저장</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 마감일 도움말 모달 */}
            {
                showDueHelp && (
                    <div className="modal-overlay" onClick={() => setShowDueHelp(false)}>
                        <div className="modal-content due-help-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>⏰ 마감일 — 우선순위 단계</h2>
                                <button className="modal-close" onClick={() => setShowDueHelp(false)}>×</button>
                            </div>
                            <div className="modal-body" style={{ padding: '12px 16px' }}>
                                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                                    마감일을 설정하면 남은 시간에 따라 아이콘과 색상이 자동으로 변합니다.
                                </p>
                                <table className="due-help-table">
                                    <thead>
                                        <tr><th>단계</th><th>남은 시간</th><th>아이콘</th><th>설명</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr><td>8</td><td>기한 초과</td><td>🔴🔴</td><td>긴급 — 이미 지남</td></tr>
                                        <tr><td>7</td><td>1시간 이내</td><td>🔴</td><td>긴급 — 직전</td></tr>
                                        <tr><td>6</td><td>1~6시간</td><td>🟠</td><td>당장 처리</td></tr>
                                        <tr><td>5</td><td>6~24시간</td><td>🟡</td><td>오늘 내</td></tr>
                                        <tr><td>4</td><td>1~3일</td><td>🟢</td><td>이번 주</td></tr>
                                        <tr><td>3</td><td>3~7일</td><td>🔵</td><td>여유</td></tr>
                                        <tr><td>2</td><td>7~14일</td><td>🟣</td><td>넉넉</td></tr>
                                        <tr><td>1</td><td>14일 초과</td><td>⚪</td><td>장기</td></tr>
                                        <tr style={{ color: 'var(--color-text-muted)' }}><td>0</td><td>미설정</td><td>—</td><td>일반</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 반복 확인 모달 */}
            {
                showRepeatConfirm && (
                    <Modal isOpen={showRepeatConfirm} onClose={handleRepeatCancel} title="🔄 반복 항목 생성">
                        <div style={{ padding: '8px 0' }}>
                            <p style={{ fontSize: 14, marginBottom: 16 }}>
                                다음 반복 항목을 생성하시겠습니까?
                            </p>
                            {repeatConfirmItem && (
                                <div style={{ padding: '8px 12px', background: 'var(--color-surface, #f5f5f5)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                                    <strong>{repeatConfirmItem.title}</strong>
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-secondary btn-block" onClick={handleRepeatCancel}>
                                    생성 안 함
                                </button>
                                <button className="btn btn-primary btn-block" onClick={handleRepeatConfirm}>
                                    생성
                                </button>
                            </div>
                        </div>
                    </Modal>
                )
            }

            {/* 업그레이드 모달 */}
            <UpgradeModal
                isOpen={showUpgradeModal}
                onClose={() => setShowUpgradeModal(false)}
                currentPlan={project?.ownerPlan || 'free'}
                reason={upgradeReason}
                profile={profile}
                onTrialStart={() => refreshProfile()}
            />

            {/* CSV 가져오기 파일 input */}
            <input type="file" accept=".csv" ref={csvFileRef}
                style={{ display: 'none' }} onChange={handleImportCsvFile} />

            {/* CSV 가져오기 충돌 해결 모달 */}
            {
                csvImportConflicts && (
                    <Modal isOpen onClose={() => setCsvImportConflicts(null)} title="CSV 가져오기 - 중복 항목">
                        <div style={{ padding: '8px 0' }}>
                            <p style={{ fontWeight: 600, marginBottom: 8 }}>
                                "{csvImportConflicts.conflicts[csvImportConflicts.currentIdx]?.title}"
                            </p>
                            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                                같은 제목의 체크리스트가 이미 존재합니다. ({csvImportConflicts.currentIdx + 1} / {csvImportConflicts.conflicts.length})
                            </p>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button className="btn btn-primary btn-sm" onClick={() => handleConflictDecision('overwrite')}>
                                    덮어쓰기
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => handleConflictDecision('rename')}>
                                    이름 변경
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={() => handleConflictDecision('skip')}>
                                    건너뛰기
                                </button>
                            </div>
                        </div>
                    </Modal>
                )
            }

            {/* 활동명 입력 팝업 (필수) */}
            <Modal
                isOpen={showDisplayNamePrompt}
                onClose={() => {
                    const myMember = project?.members?.[profile?.uid];
                    if (myMember?.displayName) {
                        setShowDisplayNamePrompt(false);
                        setMyDisplayNameInput('');
                    }
                }}
                title="📛 활동명 입력"
                footer={
                    <button className="btn btn-primary" onClick={handleSaveMyDisplayName}>확인</button>
                }
            >
                <p>"{project?.name}" 페이지에서 활동명을 사용합니다.</p>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    활동명은 이 페이지 내에서만 사용되는 별도의 이름입니다.<br />
                    같은 페이지 내에서만 중복이 불가합니다.
                </p>
                <input
                    type="text"
                    className="input-field"
                    placeholder="활동명을 입력하세요"
                    value={myDisplayNameInput}
                    onChange={e => setMyDisplayNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveMyDisplayName(); } }}
                    autoFocus
                />
            </Modal>

            {/* ===== 이미지 뷰어 모달 ===== */}
            {viewerImage && (
                <ImageViewer url={viewerImage} onClose={() => setViewerImage(null)} />
            )}
        </div >
    );
}
