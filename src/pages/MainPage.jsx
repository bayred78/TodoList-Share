import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useToastStore from '../stores/toastStore';
import { subscribeToMyProjects, createProject, updateProject, deleteProject, getRoleLabel, getCachedProjects, deltaFetchProjects, updateProjectDisplayNameMode } from '../services/projectService';
import { subscribeToMyInvitations, subscribeToSentInvitations, acceptInvitation, rejectInvitation, cancelInvitation } from '../services/invitationService';
import { getUserPlan, getEffectivePlan, getUserLimits, LIMITS } from '../services/subscriptionService';
import UpgradeModal from '../components/common/UpgradeModal';
import Modal from '../components/common/Modal';
import { LABEL_COLORS, COLOR_MAP, normalizeColorId } from '../constants/colors';
import './MainPage.css';
import { toggleCheck, getCachedItems } from '../services/todoService';
import {
    searchProjects, searchItems, sortResults, highlightText,
    getRecentSearches, addRecentSearch, clearRecentSearches, preloadAllItems
} from '../services/searchService';
import { sendDirectMessage } from '../services/chatService';
import { findUserByNicknameOrEmail } from '../services/userService';
import { subscribeToFavoriteItems, subscribeToFavoriteFriends, addFavoriteFriend, removeFavoriteFriend, updateFriendMemo, removeFavoriteItem } from '../services/favoriteService';

const VIEW_MODES = ['card', 'grid', 'list'];
const VIEW_MODE_ICONS = { card: '🃏', grid: '🔲', list: '📋' };
const VIEW_MODE_LABELS = { card: '카드', grid: '2열', list: '리스트' };

export default function MainPage() {
    const { profile, logout, refreshProfile } = useAuthStore();
    const addToast = useToastStore((s) => s.addToast);
    const navigate = useNavigate();

    const [projects, setProjects] = useState([]);
    const [invitations, setInvitations] = useState([]);
    const [sentInvitations, setSentInvitations] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createOptionSheet, setCreateOptionSheet] = useState(null); // 'color'|'tag'|'displayName'|null
    const [editOptionSheet, setEditOptionSheet] = useState(null); // 'color'|'tag'|'displayName'|null
    const [projectName, setProjectName] = useState('');
    const [projectDesc, setProjectDesc] = useState('');
    const [creating, setCreating] = useState(false);
    const [activeTab, setActiveTab] = useState('projects');
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('mainViewMode') || 'card');
    const [projectColor, setProjectColor] = useState(null);
    const [colorFilters, setColorFilters] = useState([]);
    const [showColorFilter, setShowColorFilter] = useState(false);

    // 즐겨찾기
    const [favoriteItems, setFavoriteItems] = useState([]);
    const [favoriteFriends, setFavoriteFriends] = useState([]);
    const [favSubTab, setFavSubTab] = useState('checklist');
    const [editingMemoId, setEditingMemoId] = useState(null);
    const [memoInput, setMemoInput] = useState('');

    // 활동명 (createProject/acceptInvitation용)
    const [useDisplayName, setUseDisplayName] = useState(false);
    const [displayNameInput, setDisplayNameInput] = useState('');

    // 드래그 앤 드롭
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);
    const [dragOverId, setDragOverId] = useState(null);

    const handleDragStart = (e, projectId) => {
        dragItem.current = projectId;
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.style.opacity = '0.5';
    };

    const handleDragEnd = (e) => {
        e.currentTarget.style.opacity = '1';
        setDragOverId(null);
    };

    const handleDragOver = (e, projectId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dragOverItem.current = projectId;
        setDragOverId(projectId);
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        setDragOverId(null);
        if (!dragItem.current || !dragOverItem.current || dragItem.current === dragOverItem.current) return;

        const sortedList = [...projects].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
        const fromIdx = sortedList.findIndex(p => p.id === dragItem.current);
        const toIdx = sortedList.findIndex(p => p.id === dragOverItem.current);
        if (fromIdx < 0 || toIdx < 0) return;

        const [moved] = sortedList.splice(fromIdx, 1);
        sortedList.splice(toIdx, 0, moved);

        try {
            const promises = sortedList.map((p, idx) =>
                updateProject(p.id, { order: idx })
            );
            await Promise.all(promises);
        } catch (error) {
            addToast('순서 변경에 실패했습니다.', 'error');
        }

        dragItem.current = null;
        dragOverItem.current = null;
    };

    // 페이지 수정
    const [showEditModal, setShowEditModal] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [saving, setSaving] = useState(false);

    // DM(직접 메시지)
    const [showDmModal, setShowDmModal] = useState(false);
    const [dmRecipient, setDmRecipient] = useState('');
    const [dmMessage, setDmMessage] = useState('');
    const [dmSearchResult, setDmSearchResult] = useState(null);
    const [dmSearching, setDmSearching] = useState(false);
    const [dmSending, setDmSending] = useState(false);
    const [directMessages, setDirectMessages] = useState([]);

    useEffect(() => {
        if (!profile) return;
        let isMounted = true;

        // ① 캐시 우선 로드
        const cached = getCachedProjects();
        if (cached) setProjects(cached);

        // ② 실시간 구독 시작
        let unsub1 = subscribeToMyProjects(profile.uid, setProjects);
        const unsub2 = subscribeToMyInvitations(profile.uid, setInvitations);
        const unsub3 = subscribeToSentInvitations(profile.uid, setSentInvitations);
        let reconnectTimer = null;

        // ③ 탭 비활성/활성 처리
        const handleVisibility = () => {
            if (document.hidden) {
                clearTimeout(reconnectTimer);
                unsub1();
                unsub1 = () => { };
            } else {
                const c = getCachedProjects();
                if (c) setProjects(c);

                clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(async () => {
                    if (!isMounted) return;
                    try {
                        const delta = await deltaFetchProjects(profile.uid);
                        if (!isMounted) return;
                        if (delta) setProjects(delta);
                    } catch (e) {
                        console.warn('Delta fetch failed:', e);
                    }
                    if (!isMounted) return;
                    unsub1 = subscribeToMyProjects(profile.uid, setProjects);
                }, 3000);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        // ④ DM(직접 메시지) 실시간 구독
        let unsubDm = () => { };
        (async () => {
            const { collection, query, where, orderBy, onSnapshot } = await import('firebase/firestore');
            const { db: fireDb } = await import('../services/firebase');
            const dmQuery = query(
                collection(fireDb, 'users', profile.uid, 'notifications'),
                where('type', '==', 'dm'),
                orderBy('createdAt', 'desc')
            );
            unsubDm = onSnapshot(dmQuery, (snap) => {
                if (!isMounted) return;
                const dms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setDirectMessages(dms);
            });
        })();

        return () => {
            isMounted = false;
            unsub1(); unsub2(); unsub3(); unsubDm();
            clearTimeout(reconnectTimer);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [profile]);

    // 즐겨찾기 구독
    useEffect(() => {
        if (!profile?.uid) return;
        const unsub1 = subscribeToFavoriteItems(profile.uid, setFavoriteItems);
        const unsub2 = subscribeToFavoriteFriends(profile.uid, setFavoriteFriends);
        return () => { unsub1(); unsub2(); };
    }, [profile?.uid]);

    // UpgradeModal state
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [upgradeReason, setUpgradeReason] = useState('');

    // 검색
    const [searchType, setSearchType] = useState('page');
    const [searchKeyword, setSearchKeyword] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [preloadReady, setPreloadReady] = useState(false);
    const [recentSearches, setRecentSearches] = useState(getRecentSearches());
    const [showFilters, setShowFilters] = useState(false);
    const [sortBy, setSortBy] = useState('relevance');
    const [filters, setFilters] = useState({
        status: 'all',
        colors: [],
        labels: [],
        dueDate: 'all',
        due: [],
        repeat: null,
        attachment: null,
        members: [],
    });
    const searchTimerRef = useRef(null);
    const [showMemberFilter, setShowMemberFilter] = useState(false);
    const [pageFilters, setPageFilters] = useState({ colors: [], tags: [] });
    const [showPageFilters, setShowPageFilters] = useState(false);
    const [pageSortBy, setPageSortBy] = useState('relevance');
    const [projectTags, setProjectTags] = useState([]);
    const [newProjectTag, setNewProjectTag] = useState('');
    const [tagFilters, setTagFilters] = useState([]);

    // 모든 프로젝트의 태그 수집
    const allTags = useMemo(() => {
        const set = new Set();
        projects.forEach(p => (p.projectTags || []).forEach(l => set.add(l)));
        return [...set].sort();
    }, [projects]);

    // 모든 프로젝트의 체크리스트 라벨 수집 (검색 필터용)
    const allLabels = useMemo(() => {
        const set = new Set();
        projects.forEach(p => (p.projectLabels || []).forEach(l => set.add(l)));
        return [...set].sort();
    }, [projects]);

    // 모든 프로젝트의 구성원 수집
    const allMembers = useMemo(() => {
        const map = new Map();
        projects.forEach(p => {
            if (p.members) Object.entries(p.members).forEach(([uid, m]) => {
                if (!map.has(m.nickname)) map.set(m.nickname, { uid, nickname: m.nickname });
            });
        });
        return [...map.values()].sort((a, b) => a.nickname.localeCompare(b.nickname));
    }, [projects]);

    const updateFilter = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };
    const toggleColorFilter = (colorId) => {
        setFilters(prev => ({
            ...prev,
            colors: prev.colors.includes(colorId)
                ? prev.colors.filter(c => c !== colorId)
                : [...prev.colors, colorId]
        }));
    };
    const toggleLabelFilter = (label) => {
        setFilters(prev => ({
            ...prev,
            labels: prev.labels.includes(label)
                ? prev.labels.filter(l => l !== label)
                : [...prev.labels, label]
        }));
    };
    const toggleDueFilter = (dueId) => {
        setFilters(prev => ({ ...prev, due: prev.due.includes(dueId) ? prev.due.filter(x => x !== dueId) : [...prev.due, dueId] }));
    };
    const toggleMemberFilter = (uid) => {
        setFilters(prev => ({ ...prev, members: prev.members.includes(uid) ? prev.members.filter(x => x !== uid) : [...prev.members, uid] }));
    };
    const resetFilters = () => {
        setFilters({ status: 'all', colors: [], labels: [], dueDate: 'all', due: [], repeat: null, attachment: null, members: [] });
    };
    const hasActiveFilters = filters.status !== 'all' || filters.colors.length > 0
        || filters.labels.length > 0 || filters.dueDate !== 'all'
        || filters.due.length > 0 || filters.repeat !== null
        || filters.attachment !== null || filters.members.length > 0;
    const activeFilterCount = (filters.status !== 'all' ? 1 : 0)
        + filters.colors.length + filters.labels.length
        + (filters.dueDate !== 'all' ? 1 : 0) + filters.due.length
        + (filters.repeat ? 1 : 0) + (filters.attachment ? 1 : 0)
        + filters.members.length;

    // 페이지 필터 헬퍼
    const hasActivePageFilters = pageFilters.colors.length > 0 || pageFilters.tags.length > 0;
    const pageFilterCount = pageFilters.colors.length + pageFilters.tags.length;
    const resetPageFilters = () => setPageFilters({ colors: [], tags: [] });

    const executeSearch = useCallback((keyword, type, currentFilters, currentSort) => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        const trimmed = (keyword || '').trim();
        const delay = trimmed.length >= 2 ? 300 : 0;
        searchTimerRef.current = setTimeout(() => {
            setSearchLoading(true);
            try {
                if (type === 'page') {
                    const res = searchProjects(projects, trimmed, currentFilters);
                    setSearchResults(sortResults(res, currentSort));
                } else {
                    const res = searchItems(projects, trimmed, currentFilters);
                    setSearchResults(sortResults(res, currentSort));
                }
                if (trimmed.length >= 2) {
                    addRecentSearch(trimmed);
                    setRecentSearches(getRecentSearches());
                }
            } finally { setSearchLoading(false); }
        }, delay);
    }, [projects]);

    // 필터/정렬 변경 시 즉시 재검색
    useEffect(() => {
        if (activeTab !== 'search') return;
        setSearchLoading(true);
        try {
            const trimmed = (searchKeyword || '').trim();
            if (searchType === 'page') {
                const res = searchProjects(projects, trimmed, pageFilters);
                setSearchResults(sortResults(res, pageSortBy));
            } else {
                const res = searchItems(projects, trimmed, filters);
                setSearchResults(sortResults(res, sortBy));
            }
        } finally { setSearchLoading(false); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, sortBy, pageFilters, pageSortBy, searchType]);

    // 검색 탭 진입 시 모든 프로젝트 아이템 미리 로드 + 전체 목록 즉시 표시
    useEffect(() => {
        if (activeTab === 'search' && projects.length > 0) {
            // 페이지 검색은 프리로드 불필요 → 즉시 전체 목록
            if (searchType === 'page') {
                const res = searchProjects(projects, '', pageFilters);
                setSearchResults(sortResults(res, pageSortBy));
            }
            // 체크리스트는 프리로드 후 전체 목록
            if (!preloadReady) {
                preloadAllItems(projects).then(() => {
                    setPreloadReady(true);
                    if (searchType === 'checklist') {
                        const res = searchItems(projects, '', filters);
                        setSearchResults(sortResults(res, sortBy));
                    }
                });
            } else if (searchType === 'checklist') {
                const res = searchItems(projects, '', filters);
                setSearchResults(sortResults(res, sortBy));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, projects, preloadReady]);

    const handleSearchToggle = async (item) => {
        try {
            await toggleCheck(item.projectId, item.id, !item.checked, item);
            setSearchResults(prev => prev.map(r =>
                r.id === item.id && r.projectId === item.projectId
                    ? { ...r, checked: !r.checked }
                    : r
            ));
        } catch {
            addToast('체크 변경에 실패했습니다.', 'error');
        }
    };

    const handleCreateProject = async (e) => {
        e.preventDefault();
        if (!projectName.trim()) {
            addToast('페이지 이름을 입력해주세요.', 'warning');
            return;
        }
        const trimmedName = projectName.trim();
        if (projects.find(p => p.name === trimmedName)) {
            addToast('이미 같은 이름의 페이지가 있습니다.', 'warning');
            return;
        }
        // ★ 페이지 생성 수 제한 체크 (본인 소유 페이지만 카운트)
        const myOwnedProjects = projects.filter(p => p.ownerId === profile.uid);
        const actualPlan = getUserPlan(profile);
        const effectivePlan = getEffectivePlan(profile);
        const limit = LIMITS[effectivePlan].maxPages;
        if (myOwnedProjects.length >= limit) {
            setUpgradeReason('maxPages');
            setShowUpgradeModal(true);
            return;
        }
        if (useDisplayName && !displayNameInput.trim()) {
            addToast('활동명을 입력해주세요.', 'warning');
            return;
        }
        if (useDisplayName && (displayNameInput.trim().length < 2 || displayNameInput.trim().length > 20)) {
            addToast('활동명은 2~20자로 입력해주세요.', 'warning');
            return;
        }
        setCreating(true);
        try {
            const projectId = await createProject(profile.uid, profile.nickname, projectName.trim(), projectDesc.trim(), actualPlan, useDisplayName, displayNameInput.trim());
            if (projectColor) {
                await updateProject(projectId, { color: projectColor });
            }
            if (projectTags.length > 0) {
                await updateProject(projectId, { projectTags });
            }
            setShowCreateModal(false);
            setProjectName('');
            setProjectDesc('');
            setProjectColor(null);
            setProjectTags([]);
            setNewProjectTag('');
            setUseDisplayName(false);
            setDisplayNameInput('');
            addToast('페이지가 생성되었습니다!', 'success');
            navigate(`/project/${projectId}`);
        } catch (error) {
            addToast('페이지 생성에 실패했습니다.', 'error');
        } finally {
            setCreating(false);
        }
    };

    const handleAcceptInvite = async (invitationId) => {
        try {
            await acceptInvitation(invitationId);
            addToast('초대를 수락했습니다!', 'success');
        } catch (error) {
            addToast(error.message || '초대 수락에 실패했습니다.', 'error');
        }
    };

    const handleRejectInvite = async (invitationId) => {
        try {
            await rejectInvitation(invitationId);
            addToast('초대를 거절했습니다.', 'info');
        } catch (error) {
            addToast('초대 거절에 실패했습니다.', 'error');
        }
    };

    const handleCancelInvite = async (invitationId) => {
        try {
            await cancelInvitation(invitationId);
            addToast('초대를 취소했습니다.', 'info');
        } catch (error) {
            addToast('초대 취소에 실패했습니다.', 'error');
        }
    };

    // 페이지 수정
    const handleEditOpen = (e, project) => {
        e.stopPropagation();
        setEditTarget(project);
        setEditName(project.name);
        setEditDesc(project.description || '');
        setProjectColor(project.color || null);
        setProjectTags(project.projectTags || []);
        setNewProjectTag('');
        setEditOptionSheet(null);
        setShowEditModal(true);
    };

    const handleSaveEdit = async () => {
        if (!editName.trim()) {
            addToast('페이지 이름을 입력해주세요.', 'warning');
            return;
        }
        const trimmedEditName = editName.trim();
        if (projects.find(p => p.name === trimmedEditName && p.id !== editTarget.id)) {
            addToast('이미 같은 이름의 페이지가 있습니다.', 'warning');
            return;
        }
        setSaving(true);
        try {
            await updateProject(editTarget.id, {
                name: editName.trim(),
                description: editDesc.trim(),
                color: projectColor || null,
                projectTags: projectTags,
            });
            addToast('페이지 정보가 수정되었습니다.', 'success');
            setEditOptionSheet(null);
            setShowEditModal(false);
        } catch (error) {
            addToast('페이지 수정에 실패했습니다.', 'error');
        } finally {
            setSaving(false);
        }
    };

    // X 버튼: 메시지 삭제 (받은 초대 - 미응답이면 거절 처리, 보낸 초대 - 삭제)
    const handleDismissReceivedInvite = async (invitationId) => {
        try {
            await rejectInvitation(invitationId);
        } catch (error) {
            addToast('삭제에 실패했습니다.', 'error');
        }
    };

    const handleDismissSentInvite = async (invitationId) => {
        try {
            await cancelInvitation(invitationId);
        } catch (error) {
            addToast('삭제에 실패했습니다.', 'error');
        }
    };

    // 캘린더 공유 수락 → 해당 프로젝트 페이지설정으로 이동
    const handleAcceptCalendarShare = (req) => {
        navigate(`/project/${req.projectId}?openSettings=true`);
    };

    // 캘린더 공유 거절 + notifications에 알림 저장
    const handleRejectCalendarShare = async (req) => {
        try {
            const { updateDoc, doc, serverTimestamp, arrayUnion } = await import('firebase/firestore');
            const { db } = await import('../services/firebase');
            await updateDoc(doc(db, 'projects', req.projectId), {
                [`calendarShareRequests.${req.userId}`]: false,
                notifications: arrayUnion({
                    text: `📅 [${req.nickname}]님의 캘린더 공유 요청이 거절되었습니다.`,
                    projectName: req.projectName,
                    createdAt: new Date().toISOString(),
                    type: 'calendar',
                }),
                updatedAt: serverTimestamp(),
            });
            addToast('캘린더 공유 요청을 거절했습니다.', 'info');
        } catch (error) {
            addToast('거절에 실패했습니다.', 'error');
        }
    };

    const toggleViewMode = () => {
        const currentIndex = VIEW_MODES.indexOf(viewMode);
        const nextMode = VIEW_MODES[(currentIndex + 1) % VIEW_MODES.length];
        setViewMode(nextMode);
        localStorage.setItem('mainViewMode', nextMode);
    };

    // 요청 탭: 받은 초대(pending) + 보낸 초대(전체 상태) + 캘린더 요청 합산 카운트
    const calendarShareRequests = projects.reduce((acc, project) => {
        if (project.ownerId === profile?.uid && project.calendarShareRequests) {
            const pending = Object.entries(project.calendarShareRequests)
                .filter(([uid, requested]) => requested && uid !== profile?.uid);
            pending.forEach(([uid]) => {
                const member = project.members?.[uid];
                if (member) {
                    acc.push({
                        projectId: project.id,
                        projectName: project.name,
                        userId: uid,
                        nickname: member.nickname,
                    });
                }
            });
        }
        return acc;
    }, []);

    // 참여자용: 관리자가 캘린더를 공유했지만 아직 확인하지 않은 알림
    const calendarSharedNotifications = projects.reduce((acc, project) => {
        if (project.ownerId !== profile?.uid && project.calendarSharedWith?.[profile?.uid] && !project.calendarShareAccepted?.[profile?.uid]) {
            acc.push({
                projectId: project.id,
                projectName: project.name,
                ownerNickname: project.members?.[project.ownerId]?.nickname || '관리자',
            });
        }
        return acc;
    }, []);

    // 참여자: 캘린더 공유 알림 확인
    const handleAcknowledgeCalendarShare = async (notification) => {
        try {
            const { updateDoc, doc, serverTimestamp } = await import('firebase/firestore');
            const { db } = await import('../services/firebase');
            await updateDoc(doc(db, 'projects', notification.projectId), {
                [`calendarShareAccepted.${profile.uid}`]: true,
                updatedAt: serverTimestamp(),
            });
            addToast('캘린더 공유를 확인했습니다. Gmail에서 초대를 수락해주세요.', 'success');
        } catch (error) {
            addToast('처리에 실패했습니다.', 'error');
        }
    };

    // 시스템 알림 수집 (각 프로젝트의 notifications 배열에서)
    const systemNotifications = projects.reduce((acc, project) => {
        if (project.notifications && Array.isArray(project.notifications)) {
            project.notifications.forEach((noti, idx) => {
                // 본인이 생성한 activity 알림 제외
                if (noti.type === 'activity' && noti.actorId === profile?.uid) return;
                acc.push({
                    ...noti,
                    projectId: project.id,
                    projectName: noti.projectName || project.name,
                    idx,
                });
            });
        }
        return acc;
    }, []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const requestCount = invitations.length + sentInvitations.length + calendarShareRequests.length + calendarSharedNotifications.length + systemNotifications.length + directMessages.length;

    const getStatusBadge = (status) => {
        switch (status) {
            case 'pending': return <span className="badge badge-warning">대기 중</span>;
            case 'accepted': return <span className="badge badge-success">수락됨</span>;
            case 'rejected': return <span className="badge badge-danger">거절됨</span>;
            default: return <span className="badge badge-primary">{status}</span>;
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        if (diff < 60000) return '방금 전';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
        return `${date.getMonth() + 1}/${date.getDate()}`;
    };

    return (
        <div className="page">
            <div className="container">
                <div className="page-header">
                    <h1>TodoList Share</h1>
                    <div className="header-actions">
                        <button
                            className="header-icon-btn"
                            onClick={() => {
                                window.location.reload();
                            }}
                            title="새로고침"
                        >
                            🔄
                        </button>
                        <button
                            className="header-icon-btn"
                            onClick={toggleViewMode}
                            title={`보기: ${VIEW_MODE_LABELS[viewMode]}`}
                        >
                            {VIEW_MODE_ICONS[viewMode]}
                        </button>
                        <button
                            className="header-icon-btn"
                            onClick={() => navigate('/settings')}
                            title="설정"
                        >
                            ⚙️
                        </button>
                    </div>
                </div>

                {/* 탭 */}
                <div className="tab-bar">
                    <button
                        data-tab="projects"
                        className={`tab-item ${activeTab === 'projects' ? 'active' : ''}`}
                        onClick={() => {
                            if (activeTab === 'projects') {
                                setShowColorFilter(prev => !prev);
                            } else {
                                setActiveTab('projects');
                                setShowColorFilter(false);
                            }
                        }}
                    >
                        페이지 {projects.length > 0 && `(${projects.length})`}{(colorFilters.length + tagFilters.length) > 0 && ` 🔍${colorFilters.length + tagFilters.length}`}
                    </button>
                    <button
                        data-tab="search"
                        className={`tab-item ${activeTab === 'search' ? 'active' : ''}`}
                        onClick={() => {
                            const limits = getUserLimits(profile);
                            if (!limits.search) {
                                setUpgradeReason('search');
                                setShowUpgradeModal(true);
                                return;
                            }
                            setActiveTab('search');
                            setShowColorFilter(false);
                        }}
                    >
                        🔍 검색{!getUserLimits(profile).search && ' 🔒'}
                    </button>
                    <button
                        data-tab="favorites"
                        className={`tab-item ${activeTab === 'favorites' ? 'active' : ''}`}
                        onClick={() => setActiveTab('favorites')}
                    >
                        ⭐ 즐겨찾기
                    </button>
                    <button
                        data-tab="requests"
                        className={`tab-item ${activeTab === 'requests' ? 'active' : ''}`}
                        onClick={() => setActiveTab('requests')}
                    >
                        메세지 {requestCount > 0 && (
                            <span className="invite-badge">{requestCount}</span>
                        )}
                    </button>
                </div>

                {/* 색상 필터 패널 */}
                {showColorFilter && activeTab === 'projects' && (
                    <div className="filter-panel">
                        <div className="filter-section">
                            <span className="filter-section-title">🏅 중요도</span>
                            <div className="filter-chips">
                                {LABEL_COLORS.map(c => (
                                    <button
                                        key={c.id}
                                        className={`filter-chip ${colorFilters.includes(c.id) ? 'active' : ''}`}
                                        onClick={() => setColorFilters(prev =>
                                            prev.includes(c.id)
                                                ? prev.filter(x => x !== c.id)
                                                : [...prev, c.id]
                                        )}
                                    >
                                        <span className="filter-chip-dot" style={{ background: c.hex }} />
                                        {c.name}
                                    </button>
                                ))}
                                <button
                                    className={`filter-chip ${colorFilters.includes('none') ? 'active' : ''}`}
                                    onClick={() => setColorFilters(prev =>
                                        prev.includes('none')
                                            ? prev.filter(x => x !== 'none')
                                            : [...prev, 'none']
                                    )}
                                >
                                    <span className="filter-chip-dot" style={{ background: 'var(--color-bg, #fff)', border: '2px dashed var(--color-text-muted, #aaa)' }} />
                                    무순위
                                </button>
                            </div>
                        </div>
                        {allTags.length > 0 && (
                            <div className="filter-section">
                                <span className="filter-section-title">🏷️ 태그</span>
                                <div className="filter-chips">
                                    {allTags.map(tag => (
                                        <button key={tag}
                                            className={`filter-chip ${tagFilters.includes(tag) ? 'active' : ''}`}
                                            onClick={() => setTagFilters(prev =>
                                                prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                                            )}>🏷️ {tag}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {(colorFilters.length > 0 || tagFilters.length > 0) && (
                            <button className="filter-clear-btn" onClick={() => { setColorFilters([]); setTagFilters([]); }}>
                                🗑️ 필터 초기화
                            </button>
                        )}
                    </div>
                )}

                {/* ★ 검색 콘텐츠 */}
                {activeTab === 'search' && (
                    <div className="search-container">
                        {/* 검색 유형 토글 */}
                        <div className="search-type-toggle">
                            <button className={`search-type-btn ${searchType === 'page' ? 'active' : ''}`}
                                onClick={() => {
                                    setSearchType('page');
                                    setSearchKeyword('');
                                    const res = searchProjects(projects, '', pageFilters);
                                    setSearchResults(sortResults(res, pageSortBy));
                                }}>
                                📄 페이지 검색
                            </button>
                            <button className={`search-type-btn ${searchType === 'checklist' ? 'active' : ''}`}
                                onClick={() => {
                                    setSearchType('checklist');
                                    setSearchKeyword('');
                                    const res = searchItems(projects, '', filters);
                                    setSearchResults(sortResults(res, sortBy));
                                }}>
                                ✅ 체크리스트 검색
                            </button>
                        </div>

                        {/* 검색 입력 */}
                        <div className="search-input-wrapper">
                            <input
                                className="search-input"
                                placeholder={searchType === 'page' ? '페이지 이름/설명 검색...' : '체크리스트 제목/내용 검색...'}
                                value={searchKeyword}
                                onChange={(e) => {
                                    setSearchKeyword(e.target.value);
                                    executeSearch(e.target.value, searchType,
                                        searchType === 'page' ? pageFilters : filters,
                                        searchType === 'page' ? pageSortBy : sortBy);
                                }}
                            />
                            {searchKeyword && (
                                <button className="search-clear-btn"
                                    onClick={() => {
                                        setSearchKeyword('');
                                        // 클리어 시 전체 목록 복귀
                                        if (searchType === 'page') {
                                            const res = searchProjects(projects, '', pageFilters);
                                            setSearchResults(sortResults(res, pageSortBy));
                                        } else {
                                            const res = searchItems(projects, '', filters);
                                            setSearchResults(sortResults(res, sortBy));
                                        }
                                    }}>
                                    ✕
                                </button>
                            )}
                        </div>


                        {/* ── 공통 툴바: [필터] [최근검색어] [정렬] ── */}
                        <div className="search-toolbar">
                            <button className={`search-filter-toggle ${(searchType === 'page' ? hasActivePageFilters : hasActiveFilters) ? 'active' : ''
                                }`} onClick={() => searchType === 'page'
                                    ? setShowPageFilters(p => !p)
                                    : setShowFilters(p => !p)}>
                                ▼ 필터 {searchType === 'page'
                                    ? (hasActivePageFilters && `(${pageFilterCount})`)
                                    : (hasActiveFilters && `(${activeFilterCount})`)}
                            </button>
                            {!searchKeyword && recentSearches.length > 0 && (
                                <div className="search-recent-inline">
                                    {recentSearches.map((k, i) => (
                                        <button key={i} className="recent-chip" onClick={() => {
                                            setSearchKeyword(k);
                                            executeSearch(k, searchType,
                                                searchType === 'page' ? pageFilters : filters,
                                                searchType === 'page' ? pageSortBy : sortBy);
                                        }}>{k}</button>
                                    ))}
                                    <button className="recent-clear" onClick={() => {
                                        clearRecentSearches(); setRecentSearches([]);
                                    }}>✕</button>
                                </div>
                            )}
                            <select className="search-sort-select"
                                value={searchType === 'page' ? pageSortBy : sortBy}
                                onChange={e => searchType === 'page'
                                    ? setPageSortBy(e.target.value) : setSortBy(e.target.value)}>
                                <option value="relevance">관련도</option>
                                <option value="newest">최신순</option>
                                {searchType === 'checklist' && <option value="dueDate">마감일순</option>}
                            </select>
                        </div>

                        {/* ── 체크리스트 필터 패널 (5섹션) ── */}
                        {showFilters && searchType === 'checklist' && (
                            <div className="search-filter-panel">
                                {/* 🏅 중요도 */}
                                <div className="filter-section">
                                    <span className="filter-section-title">🏅 중요도</span>
                                    <div className="filter-chips">
                                        {LABEL_COLORS.map(c => (
                                            <button key={c.id}
                                                className={`filter-chip ${filters.colors.includes(c.id) ? 'active' : ''}`}
                                                onClick={() => toggleColorFilter(c.id)}>
                                                <span className="filter-chip-dot" style={{ background: c.hex }} /> {c.name}
                                            </button>
                                        ))}
                                        <button className={`filter-chip ${filters.colors.includes('none') ? 'active' : ''}`}
                                            onClick={() => toggleColorFilter('none')}>
                                            <span className="filter-chip-dot" style={{ background: 'var(--color-bg)', border: '2px dashed var(--color-text-muted)' }} /> 무순위
                                        </button>
                                    </div>
                                </div>
                                {/* ⏰ 마감 6단계 */}
                                <div className="filter-section">
                                    <span className="filter-section-title">⏰ 마감</span>
                                    <div className="filter-chips">
                                        {[
                                            { v: 'overdue', l: '기한초과', e: '🔴' }, { v: 'day1', l: '~1일', e: '🟠' },
                                            { v: 'day3', l: '1~3일', e: '🟡' }, { v: 'day7', l: '3~7일', e: '🔵' },
                                            { v: 'day14', l: '7~14일', e: '🟣' }, { v: 'later', l: '이후', e: '⚪' },
                                        ].map(d => (
                                            <button key={d.v}
                                                className={`filter-chip ${filters.due.includes(d.v) ? 'active' : ''}`}
                                                onClick={() => toggleDueFilter(d.v)}>
                                                {d.e} {d.l}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* 🏷️ 라벨 */}
                                {allLabels.length > 0 && (
                                    <div className="filter-section">
                                        <span className="filter-section-title">🏷️ 라벨</span>
                                        <div className="filter-chips">
                                            {allLabels.map(label => (
                                                <button key={label}
                                                    className={`filter-chip ${filters.labels.includes(label) ? 'active' : ''}`}
                                                    onClick={() => toggleLabelFilter(label)}>🏷️ {label}</button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {/* 기타 */}
                                <div className="filter-section">
                                    <span className="filter-section-title">기타</span>
                                    <div className="filter-chips">
                                        <button className={`filter-chip ${filters.repeat === 'yes' ? 'active' : ''}`}
                                            onClick={() => updateFilter('repeat', filters.repeat === 'yes' ? null : 'yes')}>
                                            🔄 반복</button>
                                        <button className={`filter-chip ${filters.attachment === 'yes' ? 'active' : ''}`}
                                            onClick={() => updateFilter('attachment', filters.attachment === 'yes' ? null : 'yes')}>
                                            📎 첨부</button>
                                        <button className={`filter-chip ${filters.attachment === 'image' ? 'active' : ''}`}
                                            onClick={() => updateFilter('attachment', filters.attachment === 'image' ? null : 'image')}>
                                            🖼️ 이미지</button>
                                        <button className={`filter-chip ${filters.attachment === 'file' ? 'active' : ''}`}
                                            onClick={() => updateFilter('attachment', filters.attachment === 'file' ? null : 'file')}>
                                            📄 서류</button>
                                        <button className={`filter-chip ${filters.status === 'checked' ? 'active' : ''}`}
                                            onClick={() => updateFilter('status', filters.status === 'checked' ? 'all' : 'checked')}>
                                            ✅ 완료</button>
                                        <button className={`filter-chip ${filters.status === 'unchecked' ? 'active' : ''}`}
                                            onClick={() => updateFilter('status', filters.status === 'unchecked' ? 'all' : 'unchecked')}>
                                            ⬜ 미완료</button>
                                    </div>
                                </div>
                                {/* 👥 구성원 */}
                                <div className="filter-section">
                                    <span className="filter-section-title">
                                        👥 구성원 {filters.members.length > 0 && `(${filters.members.length})`}
                                    </span>
                                    <div className="filter-chips">
                                        {allMembers.map(m => (
                                            <button key={m.uid}
                                                className={`filter-chip ${filters.members.includes(m.uid) ? 'active' : ''}`}
                                                onClick={() => toggleMemberFilter(m.uid)}>
                                                {m.nickname}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {hasActiveFilters && (
                                    <button className="filter-clear-btn" onClick={resetFilters}>🗑️ 필터 초기화</button>
                                )}
                            </div>
                        )}

                        {/* ── 페이지 필터 패널 (색상+라벨 2섹션) ── */}
                        {showPageFilters && searchType === 'page' && (
                            <div className="search-filter-panel">
                                <div className="filter-section">
                                    <span className="filter-section-title">🏅 중요도</span>
                                    <div className="filter-chips">
                                        {LABEL_COLORS.map(c => (
                                            <button key={c.id}
                                                className={`filter-chip ${pageFilters.colors.includes(c.id) ? 'active' : ''}`}
                                                onClick={() => setPageFilters(prev => ({
                                                    ...prev,
                                                    colors: prev.colors.includes(c.id) ? prev.colors.filter(x => x !== c.id) : [...prev.colors, c.id]
                                                }))}>
                                                <span className="filter-chip-dot" style={{ background: c.hex }} /> {c.name}
                                            </button>
                                        ))}
                                        <button className={`filter-chip ${pageFilters.colors.includes('none') ? 'active' : ''}`}
                                            onClick={() => setPageFilters(prev => ({
                                                ...prev,
                                                colors: prev.colors.includes('none') ? prev.colors.filter(x => x !== 'none') : [...prev.colors, 'none']
                                            }))}>
                                            <span className="filter-chip-dot" style={{ background: 'var(--color-bg)', border: '2px dashed var(--color-text-muted)' }} /> 무순위
                                        </button>
                                    </div>
                                </div>
                                {allTags.length > 0 && (
                                    <div className="filter-section">
                                        <span className="filter-section-title">🏷️ 태그</span>
                                        <div className="filter-chips">
                                            {allTags.map(tag => (
                                                <button key={tag}
                                                    className={`filter-chip ${pageFilters.tags.includes(tag) ? 'active' : ''}`}
                                                    onClick={() => setPageFilters(prev => ({
                                                        ...prev,
                                                        tags: prev.tags.includes(tag) ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag]
                                                    }))}>🏷️ {tag}</button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {hasActivePageFilters && (
                                    <button className="filter-clear-btn" onClick={resetPageFilters}>🗑️ 필터 초기화</button>
                                )}
                            </div>
                        )}

                        {/* 결과 헤더 */}
                        <div className="search-result-count">
                            {searchLoading ? '검색 중...'
                                : searchKeyword.trim().length >= 1
                                    ? `검색 결과 ${searchResults.length}건`
                                    : `전체 ${searchResults.length}건`}
                        </div>

                        {/* 결과 — 페이지 */}
                        {searchType === 'page' && searchResults.map(p => (
                            <div key={p.id} className="search-result-card card"
                                onClick={() => navigate(`/project/${p.id}`)}>
                                {p.color && <span className="search-result-dot" style={{ background: COLOR_MAP[p.color] }} />}
                                <div className="search-result-info">
                                    <h4>{highlightText(p.name, searchKeyword).map((part, i) =>
                                        part.toLowerCase() === searchKeyword.toLowerCase()
                                            ? <mark key={i} className="search-highlight">{part}</mark>
                                            : <span key={i}>{part}</span>
                                    )}</h4>
                                    {p.description && (
                                        <p className="search-result-content">{highlightText(p.description, searchKeyword).map((part, i) =>
                                            part.toLowerCase() === searchKeyword.toLowerCase()
                                                ? <mark key={i} className="search-highlight">{part}</mark>
                                                : <span key={i}>{part}</span>
                                        )}</p>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* 결과 — 체크리스트 */}
                        {searchType === 'checklist' && searchResults.map(item => (
                            <div key={`${item.projectId}_${item.id}`} className="search-result-card card">
                                <button className="search-check-btn"
                                    onClick={(e) => { e.stopPropagation(); handleSearchToggle(item); }}>
                                    {item.checked ? '☑️' : '⬜'}
                                </button>
                                <div className="search-result-info" onClick={() => navigate(`/project/${item.projectId}?openItem=${item.id}`)}>
                                    <h4 className={item.checked ? 'search-checked' : ''}>
                                        {highlightText(item.title, searchKeyword).map((part, i) =>
                                            part.toLowerCase() === searchKeyword.toLowerCase()
                                                ? <mark key={i} className="search-highlight">{part}</mark>
                                                : <span key={i}>{part}</span>
                                        )}
                                        {item.repeatType && item.repeatType !== 'none' && ' 🔄'}
                                    </h4>
                                    {item.content && (
                                        <p className="search-result-content">{highlightText(item.content, searchKeyword).map((part, i) =>
                                            part.toLowerCase() === searchKeyword.toLowerCase()
                                                ? <mark key={i} className="search-highlight">{part}</mark>
                                                : <span key={i}>{part}</span>
                                        )}</p>
                                    )}
                                    <div className="search-result-meta-row">
                                        <span className="search-result-meta">📄 {item.projectName}</span>
                                        {item.color && <span className="search-result-dot" style={{ background: COLOR_MAP[item.color] }} />}
                                        {item.dueDate && <span className="search-result-due">
                                            📅 {(item.dueDate.toDate ? item.dueDate.toDate() : new Date(item.dueDate))
                                                .toLocaleDateString('ko-KR')}
                                        </span>}
                                        {item.labels?.map(l => (
                                            <span key={l} className="search-result-label">🏷️{l}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}





                        {/* 빈 결과 */}
                        {!searchLoading && searchResults.length === 0 && (
                            <div className="empty-state">
                                <span className="empty-state-icon">🔍</span>
                                <p className="empty-state-title">
                                    {searchKeyword.trim().length >= 1 ? '검색 결과가 없습니다' : '항목이 없습니다'}
                                </p>
                                <p className="empty-state-text">
                                    {searchKeyword.trim().length >= 1 ? '다른 검색어를 입력해보세요' : '아직 데이터가 없습니다'}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* 페이지 목록 */}
                {activeTab === 'projects' && (
                    <div
                        className={`project-list ${viewMode === 'grid' ? 'project-list-grid' : viewMode === 'list' ? 'project-list-compact' : ''}`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                    >
                        {projects.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-state-icon">📋</div>
                                <div className="empty-state-title">페이지가 없습니다</div>
                                <div className="empty-state-text">
                                    새 페이지를 만들어 할 일을 관리해보세요
                                </div>
                            </div>
                        ) : (
                            [...projects]
                                .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
                                .filter(p => {
                                    if (colorFilters.length === 0) return true;
                                    if (colorFilters.includes('none') && !p.color) return true;
                                    return colorFilters.includes(p.color);
                                })
                                .filter(p => {
                                    if (tagFilters.length === 0) return true;
                                    return (p.projectTags || []).some(t => tagFilters.includes(t));
                                })
                                .map((project) => (
                                    <div
                                        key={project.id}
                                        className={`project-card card ${viewMode === 'list' ? 'project-card-list' : ''} ${dragOverId === project.id ? 'drag-over' : ''}`}
                                        style={project.color ? { borderLeft: `4px solid ${COLOR_MAP[project.color] || 'transparent'}` } : {}}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, project.id)}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={(e) => handleDragOver(e, project.id)}
                                        onDrop={handleDrop}
                                        onClick={() => navigate(`/project/${project.id}`)}
                                    >
                                        <div className="project-card-header">
                                            <h3 className="project-card-name">{project.name}</h3>
                                            <div className="project-card-badges">
                                                {project.ownerId === profile?.uid && (
                                                    <button
                                                        className="card-edit-btn"
                                                        onClick={(e) => handleEditOpen(e, project)}
                                                        title="페이지 수정"
                                                    >✏️</button>
                                                )}
                                                {project.ownerId === profile?.uid && (
                                                    <span className="badge badge-primary">관리자</span>
                                                )}
                                                {(project.ownerPlan || 'free') === 'free' && project.memberCount > LIMITS.free.maxMembers && (
                                                    <span className="badge badge-danger">읽기 전용</span>
                                                )}
                                            </div>
                                        </div>
                                        {viewMode !== 'list' && project.description && (
                                            <p className="project-card-desc">{project.description}</p>
                                        )}
                                        {viewMode !== 'list' && (
                                            <div className="project-card-meta">
                                                <span className="project-card-members">
                                                    👥 {project.memberCount}명
                                                </span>
                                                <span className="project-card-owner">
                                                    👤 {project.ownerNickname}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ))
                        )}
                    </div>
                )}

                {/* 즐겨찾기 탭 */}
                {activeTab === 'favorites' && (
                    <div className="favorites-container">
                        <div className="favorites-sub-tabs">
                            <button
                                className={`favorites-sub-tab ${favSubTab === 'checklist' ? 'active' : ''}`}
                                onClick={() => setFavSubTab('checklist')}
                            >
                                📋 체크리스트 ({favoriteItems.length})
                            </button>
                            <button
                                className={`favorites-sub-tab ${favSubTab === 'friends' ? 'active' : ''}`}
                                onClick={() => setFavSubTab('friends')}
                            >
                                👥 친구 ({favoriteFriends.length})
                            </button>
                        </div>

                        {favSubTab === 'checklist' && (
                            <div className="favorites-list">
                                {favoriteItems.length === 0 ? (
                                    <div className="empty-state">
                                        <div className="empty-state-icon">⭐</div>
                                        <div className="empty-state-title">즐겨찾기한 체크리스트가 없습니다</div>
                                        <div className="empty-state-text">체크리스트 카드의 ☆ 버튼을 눌러 추가하세요</div>
                                    </div>
                                ) : (
                                    favoriteItems.map((fav) => (
                                        <div key={fav.id} className="card fav-item-card" onClick={() => navigate(`/project/${fav.projectId}?openItem=${fav.itemId}`)}>
                                            <div className="fav-item-header">
                                                <span className="fav-item-project">{fav.projectName}</span>
                                                <button className="fav-remove-btn" onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (window.confirm('즐겨찾기를 해제하시겠습니까?')) {
                                                        removeFavoriteItem(profile.uid, fav.projectId, fav.itemId);
                                                    }
                                                }} title="즐겨찾기 해제">⭐</button>
                                            </div>
                                            <h4 className="fav-item-title">{fav.title}</h4>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {favSubTab === 'friends' && (
                            <div className="favorites-list">
                                {favoriteFriends.length === 0 ? (
                                    <div className="empty-state">
                                        <div className="empty-state-icon">👥</div>
                                        <div className="empty-state-title">즐겨찾기한 친구가 없습니다</div>
                                        <div className="empty-state-text">메시지의 ☆ 버튼으로 친구를 추가하세요</div>
                                    </div>
                                ) : (
                                    favoriteFriends.map((friend) => (
                                        <div key={friend.id} className="card friend-card">
                                            <div className="friend-row">
                                                <div className="friend-info">
                                                    <span className="friend-nickname">{friend.nickname}</span>
                                                    <div className="friend-actions">
                                                        <button className="btn btn-primary btn-sm" onClick={() => {
                                                            setDmRecipient(friend.nickname);
                                                            setDmSearchResult({ id: friend.friendUid, nickname: friend.nickname });
                                                            setDmMessage('');
                                                            setShowDmModal(true);
                                                        }}>💬</button>
                                                        <button className="fav-remove-btn" onClick={() => { if (window.confirm('즐겨찾기를 해제하시겠습니까?')) removeFavoriteFriend(profile.uid, friend.friendUid); }} title="즐겨찾기 해제">⭐</button>
                                                    </div>
                                                </div>
                                                <div className="friend-memo-row">
                                                    {editingMemoId === friend.id ? (
                                                        <>
                                                            <input
                                                                className="input-field friend-memo-input"
                                                                value={memoInput}
                                                                onChange={(e) => setMemoInput(e.target.value)}
                                                                placeholder="비고 입력"
                                                            />
                                                            <button className="btn btn-primary btn-sm" onClick={async () => {
                                                                try {
                                                                    await updateFriendMemo(profile.uid, friend.id, memoInput);
                                                                    setEditingMemoId(null);
                                                                } catch (e) {
                                                                    addToast('비고 저장에 실패했습니다.', 'error');
                                                                }
                                                            }}>저장</button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="friend-memo-text">{friend.memo || '(비고 없음)'}</span>
                                                            <button className="btn btn-secondary btn-sm" onClick={() => {
                                                                setEditingMemoId(friend.id);
                                                                setMemoInput(friend.memo || '');
                                                            }}>편집</button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* 요청 목록 */}
                {activeTab === 'requests' && (
                    <div className="request-list">
                        {/* 받은 초대 */}
                        {invitations.length > 0 && (
                            <div className="request-section">
                                <h3 className="request-section-title">📩 받은 초대</h3>
                                {invitations.map((invite) => (
                                    <div key={invite.id} className="request-card card">
                                        <button
                                            className="request-dismiss-btn"
                                            onClick={() => handleDismissReceivedInvite(invite.id)}
                                            title="삭제 (거절 처리)"
                                        >×</button>
                                        <div className="invitation-info">
                                            <h3 className="invitation-project">{invite.projectName}</h3>
                                            <p className="invitation-from">
                                                {invite.inviterNickname}님이 초대했습니다
                                            </p>
                                            <div className="invitation-detail">
                                                <span className="badge badge-primary">{getRoleLabel(invite.role)}</span>
                                                {invite.createdAt && <span className="invitation-time">{formatTime(invite.createdAt)}</span>}
                                            </div>
                                        </div>
                                        <div className="invitation-actions">
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={() => handleAcceptInvite(invite.id)}
                                            >
                                                수락
                                            </button>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => handleRejectInvite(invite.id)}
                                            >
                                                거절
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 보낸 초대 */}
                        {sentInvitations.length > 0 && (
                            <div className="request-section">
                                <h3 className="request-section-title">📤 보낸 초대</h3>
                                {sentInvitations.map((invite) => (
                                    <div key={invite.id} className="request-card card">
                                        <button
                                            className="request-dismiss-btn"
                                            onClick={() => handleDismissSentInvite(invite.id)}
                                            title="삭제"
                                        >×</button>
                                        <div className="invitation-info">
                                            <h3 className="invitation-project">{invite.projectName}</h3>
                                            <p className="invitation-from">
                                                → {invite.inviteeNickname}님에게 초대
                                            </p>
                                            <div className="invitation-detail">
                                                {getStatusBadge(invite.status)}
                                                <span className="badge badge-primary" style={{ marginLeft: '4px' }}>{invite.role === 'readwrite' ? '읽기/쓰기' : invite.role}</span>
                                                {invite.createdAt && <span className="invitation-time">{formatTime(invite.createdAt)}</span>}
                                            </div>
                                        </div>
                                        <div className="invitation-actions">
                                            {invite.status === 'pending' && (
                                                <button
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleCancelInvite(invite.id)}
                                                >
                                                    취소
                                                </button>
                                            )}
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => handleDismissSentInvite(invite.id)}
                                            >
                                                닫기
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 캘린더 공유 요청 (관리자에게만 표시) */}
                        {calendarShareRequests.length > 0 && (
                            <div className="request-section">
                                <h3 className="request-section-title">📅 캘린더 공유 요청</h3>
                                {calendarShareRequests.map((req) => (
                                    <div key={`${req.projectId}-${req.userId}`} className="request-card card">
                                        <button
                                            className="request-dismiss-btn"
                                            onClick={() => handleRejectCalendarShare(req)}
                                            title="삭제 (거절 처리)"
                                        >×</button>
                                        <div className="invitation-info">
                                            <h3 className="invitation-project">{req.projectName}</h3>
                                            <p className="invitation-from">
                                                {req.nickname}님이 캘린더 공유를 요청했습니다
                                            </p>
                                            <span className="badge badge-warning">공유 대기</span>
                                        </div>
                                        <div className="invitation-actions">
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={() => handleAcceptCalendarShare(req)}
                                            >
                                                수락하러가기
                                            </button>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => handleRejectCalendarShare(req)}
                                            >
                                                거절
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 참여자용: 캘린더 공유됨 알림 */}
                        {calendarSharedNotifications.length > 0 && (
                            <div className="request-section">
                                <h3 className="request-section-title">📅 캘린더 공유 알림</h3>
                                {calendarSharedNotifications.map((noti) => (
                                    <div key={noti.projectId} className="request-card card">
                                        <div className="invitation-info">
                                            <h3 className="invitation-project">{noti.projectName}</h3>
                                            <p className="invitation-from">
                                                {noti.ownerNickname}님이 캘린더를 공유했습니다.
                                            </p>
                                            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                                                📧 Gmail을 확인하여 캘린더 초대를 수락해주세요.
                                            </p>
                                            <span className="badge badge-success">공유됨</span>
                                        </div>
                                        <div className="invitation-actions">
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={() => handleAcknowledgeCalendarShare(noti)}
                                            >
                                                확인
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 시스템 알림 */}
                        {systemNotifications.length > 0 && (
                            <div className="request-section">
                                <h3 className="request-section-title">🔔 시스템 알림</h3>
                                {systemNotifications.map((noti, i) => (
                                    <div key={`sys-${noti.projectId}-${i}`} className="request-card card">
                                        <button
                                            className="request-dismiss-btn"
                                            onClick={async () => {
                                                try {
                                                    const { updateDoc, doc, arrayRemove } = await import('firebase/firestore');
                                                    const { db } = await import('../services/firebase');
                                                    const project = projects.find(p => p.id === noti.projectId);
                                                    if (project?.notifications?.[noti.idx]) {
                                                        await updateDoc(doc(db, 'projects', noti.projectId), {
                                                            notifications: arrayRemove(project.notifications[noti.idx]),
                                                        });
                                                    }
                                                } catch (e) {
                                                    addToast('삭제에 실패했습니다.', 'error');
                                                }
                                            }}
                                            title="삭제"
                                        >×</button>
                                        <div className="invitation-info">
                                            <h3 className="invitation-project">{noti.projectName}</h3>
                                            <p className="invitation-from">{noti.text}</p>
                                            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                {noti.createdAt && (
                                                    <span className="invitation-time" style={{ marginRight: 'auto' }}>{formatTime(new Date(noti.createdAt))}</span>
                                                )}
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={async () => {
                                                        // 공통 알림 제거 로직
                                                        const removeNoti = async () => {
                                                            try {
                                                                const { updateDoc, doc, arrayRemove } = await import('firebase/firestore');
                                                                const { db } = await import('../services/firebase');
                                                                const project = projects.find(p => p.id === noti.projectId);
                                                                if (project?.notifications?.[noti.idx]) {
                                                                    await updateDoc(doc(db, 'projects', noti.projectId), {
                                                                        notifications: arrayRemove(project.notifications[noti.idx]),
                                                                    });
                                                                }
                                                            } catch (e) {
                                                                addToast('삭제에 실패했습니다.', 'error');
                                                            }
                                                        };
                                                        if (noti.action === 'delete') {
                                                            await removeNoti();
                                                        } else {
                                                            removeNoti();
                                                            navigate(`/project/${noti.projectId}${noti.itemId ? `?openItem=${noti.itemId}` : ''}`);
                                                        }
                                                    }}
                                                >
                                                    확인
                                                </button>
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={async () => {
                                                        try {
                                                            const { updateDoc, doc, arrayRemove } = await import('firebase/firestore');
                                                            const { db } = await import('../services/firebase');
                                                            const project = projects.find(p => p.id === noti.projectId);
                                                            if (project?.notifications?.[noti.idx]) {
                                                                await updateDoc(doc(db, 'projects', noti.projectId), {
                                                                    notifications: arrayRemove(project.notifications[noti.idx]),
                                                                });
                                                            }
                                                        } catch (e) {
                                                            addToast('삭제에 실패했습니다.', 'error');
                                                        }
                                                    }}
                                                >
                                                    닫기
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 💬 받은 DM */}
                        {directMessages.length > 0 && (
                            <div className="request-section">
                                <h3 className="request-section-title">💬 받은 메시지</h3>
                                {directMessages.map((dm) => (
                                    <div key={dm.id} className="request-card card">
                                        <button
                                            className="request-dismiss-btn"
                                            onClick={async () => {
                                                try {
                                                    const { deleteDoc, doc } = await import('firebase/firestore');
                                                    const { db: fireDb } = await import('../services/firebase');
                                                    await deleteDoc(doc(fireDb, 'users', profile.uid, 'notifications', dm.id));
                                                } catch (e) {
                                                    addToast('삭제에 실패했습니다.', 'error');
                                                }
                                            }}
                                            title="삭제"
                                        >×</button>
                                        <div className="invitation-info">
                                            <h3 className="invitation-project">{dm.senderNickname}</h3>
                                            <p className="invitation-from" style={{ whiteSpace: 'pre-wrap' }}>{dm.message}</p>
                                            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                {dm.createdAt && (
                                                    <span className="invitation-time" style={{ marginRight: 'auto' }}>{formatTime(dm.createdAt)}</span>
                                                )}
                                                <button className="btn btn-sm" style={{ fontSize: '16px', padding: '2px 6px', minWidth: 'auto' }}
                                                    onClick={() => {
                                                        const isFav = favoriteFriends.some(f => f.friendUid === dm.senderUid);
                                                        if (isFav) {
                                                            if (window.confirm('즐겨찾기를 해제하시겠습니까?')) removeFavoriteFriend(profile.uid, dm.senderUid);
                                                        } else {
                                                            addFavoriteFriend(profile.uid, dm.senderUid, dm.senderNickname);
                                                        }
                                                    }}
                                                    title="친구 즐겨찾기">
                                                    {favoriteFriends.some(f => f.friendUid === dm.senderUid) ? '⭐' : '☆'}
                                                </button>
                                                <button className="btn btn-primary btn-sm"
                                                    onClick={() => {
                                                        setDmRecipient(dm.senderNickname);
                                                        setDmSearchResult({ id: dm.senderUid, nickname: dm.senderNickname });
                                                        setDmMessage('');
                                                        setShowDmModal(true);
                                                    }}>답장</button>
                                                <button className="btn btn-secondary btn-sm"
                                                    onClick={async () => {
                                                        try {
                                                            const { deleteDoc, doc } = await import('firebase/firestore');
                                                            const { db: fireDb } = await import('../services/firebase');
                                                            await deleteDoc(doc(fireDb, 'users', profile.uid, 'notifications', dm.id));
                                                        } catch (e) {
                                                            addToast('삭제에 실패했습니다.', 'error');
                                                        }
                                                    }}>닫기</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 빈 상태 */}
                        {invitations.length === 0 && sentInvitations.length === 0 && calendarShareRequests.length === 0 && calendarSharedNotifications.length === 0 && systemNotifications.length === 0 && directMessages.length === 0 && (
                            <div className="empty-state">
                                <div className="empty-state-icon">✉️</div>
                                <div className="empty-state-title">메세지가 없습니다</div>
                                <div className="empty-state-text">
                                    받은 초대, 보낸 초대, 메시지가 여기에 표시됩니다
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* FAB — 탭별 분기 */}
            <button className="fab" onClick={() => {
                if (activeTab === 'requests') {
                    setShowDmModal(true);
                } else {
                    setProjectColor(null); setProjectTags([]); setNewProjectTag(''); setUseDisplayName(false); setDisplayNameInput(''); setCreateOptionSheet(null); setShowCreateModal(true);
                }
            }} title={activeTab === 'requests' ? '메시지 보내기' : '새 페이지'}>
                {activeTab === 'requests' ? '✉️' : '+'}
            </button>

            {/* 페이지 생성 - 전체화면 에디터 */}
            {showCreateModal && (
                <div className="fullscreen-editor">
                    <div className="fullscreen-editor-header">
                        <button className="fullscreen-editor-back" onClick={() => { setCreateOptionSheet(null); setShowCreateModal(false); setProjectTags([]); setNewProjectTag(''); setUseDisplayName(false); setDisplayNameInput(''); }}>←</button>
                        <div className="fullscreen-editor-actions">
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={handleCreateProject}
                                disabled={creating}
                            >
                                {creating ? <span className="spinner"></span> : '생성'}
                            </button>
                        </div>
                    </div>

                    {/* 생성 모드 상단 툴바 */}
                    <div className="edit-toolbar">
                        <button
                            type="button"
                            className={`edit-toolbar-btn ${createOptionSheet === 'color' ? 'active' : ''}`}
                            onClick={() => setCreateOptionSheet(createOptionSheet === 'color' ? null : 'color')}
                        >
                            <span>🏅</span><span className="edit-toolbar-label">중요도</span>
                            {projectColor && <span className="edit-toolbar-dot" style={{ background: LABEL_COLORS.find(c => c.id === projectColor)?.hex }}></span>}
                        </button>
                        <button
                            type="button"
                            className={`edit-toolbar-btn ${createOptionSheet === 'tag' ? 'active' : ''}`}
                            onClick={() => setCreateOptionSheet(createOptionSheet === 'tag' ? null : 'tag')}
                        >
                            <span>🏷️</span><span className="edit-toolbar-label">태그</span>
                            {projectTags.length > 0 && <span className="edit-toolbar-count">{projectTags.length}</span>}
                        </button>
                        <button
                            type="button"
                            className={`edit-toolbar-btn ${createOptionSheet === 'displayName' ? 'active' : ''}`}
                            onClick={() => setCreateOptionSheet(createOptionSheet === 'displayName' ? null : 'displayName')}
                        >
                            <span>📛</span><span className="edit-toolbar-label">활동명</span>
                            {useDisplayName && <span className="edit-toolbar-dot" style={{ background: 'var(--color-primary)' }}></span>}
                        </button>
                    </div>

                    {/* 옵션 시트: 중요도 */}
                    {createOptionSheet === 'color' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>🏅 중요도 선택</span>
                                <button type="button" onClick={() => setCreateOptionSheet(null)}>✕</button>
                            </div>
                            <div className="filter-chips" style={{ flexWrap: 'wrap', gap: 6, padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                {LABEL_COLORS.map(c => (
                                    <button
                                        key={c.id}
                                        className={`filter-chip ${projectColor === c.id ? 'active' : ''}`}
                                        onClick={() => setProjectColor(projectColor === c.id ? null : c.id)}
                                        type="button"
                                    >
                                        <span className="filter-chip-dot" style={{ background: c.hex }} />
                                        {c.name}
                                    </button>
                                ))}
                                <button
                                    className={`filter-chip ${projectColor === null ? 'active' : ''}`}
                                    onClick={() => setProjectColor(null)}
                                    type="button"
                                >
                                    <span className="filter-chip-dot" style={{ background: 'var(--color-bg)', border: '2px dashed var(--color-text-muted)' }} />
                                    무순위
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 옵션 시트: 태그 */}
                    {createOptionSheet === 'tag' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>🏷️ 태그 설정</span>
                                <button type="button" onClick={() => setCreateOptionSheet(null)}>✕</button>
                            </div>
                            <div style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                <div className="filter-chips" style={{ flexWrap: 'wrap', gap: 6 }}>
                                    {projectTags.map(tag => (
                                        <button key={tag} type="button" className="filter-chip active"
                                            onClick={() => setProjectTags(prev => prev.filter(t => t !== tag))}>
                                            🏷️ {tag} ×
                                        </button>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                    <input type="text" className="input-field" placeholder="새 태그"
                                        value={newProjectTag} onChange={e => setNewProjectTag(e.target.value)}
                                        style={{ flex: 1 }} />
                                    <button type="button" className="btn btn-primary btn-sm"
                                        disabled={!newProjectTag.trim()}
                                        onClick={() => {
                                            const t = newProjectTag.trim();
                                            if (t && !projectTags.includes(t)) setProjectTags(prev => [...prev, t]);
                                            setNewProjectTag('');
                                        }}>추가</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 옵션 시트: 활동명 */}
                    {createOptionSheet === 'displayName' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>📛 활동명 설정</span>
                                <button type="button" onClick={() => setCreateOptionSheet(null)}>✕</button>
                            </div>
                            <div style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input
                                        type="checkbox"
                                        checked={useDisplayName}
                                        onChange={e => setUseDisplayName(e.target.checked)}
                                    />
                                    활동명 사용
                                </label>
                                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: '0 0 6px' }}>
                                    페이지 내에서 닉네임 대신 별도의 활동명을 사용합니다.
                                </p>
                                {useDisplayName && (
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="나의 활동명을 입력하세요"
                                        value={displayNameInput}
                                        onChange={e => setDisplayNameInput(e.target.value)}
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    <div className="fullscreen-editor-body">
                        <input
                            type="text"
                            className="fullscreen-editor-title"
                            placeholder="페이지 이름을 입력하세요"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            autoFocus
                        />
                        <textarea
                            className="fullscreen-editor-content"
                            placeholder="페이지 설명을 입력하세요"
                            value={projectDesc}
                            onChange={(e) => setProjectDesc(e.target.value)}
                        />
                    </div>
                </div>
            )}

            {/* 페이지 수정 - 전체화면 에디터 */}
            {showEditModal && (
                <div className="fullscreen-editor">
                    <div className="fullscreen-editor-header">
                        <button className="fullscreen-editor-back" onClick={() => { setEditOptionSheet(null); setShowEditModal(false); setProjectTags([]); setNewProjectTag(''); }}>←</button>
                        <div className="fullscreen-editor-actions">
                            <button className="btn btn-primary btn-sm" onClick={handleSaveEdit} disabled={saving}>
                                {saving ? <span className="spinner"></span> : '저장'}
                            </button>
                        </div>
                    </div>

                    {/* 수정 모드 상단 툴바 */}
                    <div className="edit-toolbar">
                        <button
                            type="button"
                            className={`edit-toolbar-btn ${editOptionSheet === 'color' ? 'active' : ''}`}
                            onClick={() => setEditOptionSheet(editOptionSheet === 'color' ? null : 'color')}
                        >
                            <span>🏅</span><span className="edit-toolbar-label">중요도</span>
                            {projectColor && <span className="edit-toolbar-dot" style={{ background: LABEL_COLORS.find(c => c.id === projectColor)?.hex }}></span>}
                        </button>
                        <button
                            type="button"
                            className={`edit-toolbar-btn ${editOptionSheet === 'tag' ? 'active' : ''}`}
                            onClick={() => setEditOptionSheet(editOptionSheet === 'tag' ? null : 'tag')}
                        >
                            <span>🏷️</span><span className="edit-toolbar-label">태그</span>
                            {projectTags.length > 0 && <span className="edit-toolbar-count">{projectTags.length}</span>}
                        </button>
                        <button
                            type="button"
                            className={`edit-toolbar-btn ${editOptionSheet === 'displayName' ? 'active' : ''}`}
                            onClick={() => setEditOptionSheet(editOptionSheet === 'displayName' ? null : 'displayName')}
                        >
                            <span>📛</span><span className="edit-toolbar-label">활동명</span>
                            {editTarget?.useDisplayName && <span className="edit-toolbar-dot" style={{ background: 'var(--color-primary)' }}></span>}
                        </button>
                    </div>

                    {/* 옵션 시트: 중요도 */}
                    {editOptionSheet === 'color' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>🏅 중요도 선택</span>
                                <button type="button" onClick={() => setEditOptionSheet(null)}>✕</button>
                            </div>
                            <div className="filter-chips" style={{ flexWrap: 'wrap', gap: 6, padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                {LABEL_COLORS.map(c => (
                                    <button
                                        key={c.id}
                                        className={`filter-chip ${projectColor === c.id ? 'active' : ''}`}
                                        onClick={() => setProjectColor(projectColor === c.id ? null : c.id)}
                                        type="button"
                                    >
                                        <span className="filter-chip-dot" style={{ background: c.hex }} />
                                        {c.name}
                                    </button>
                                ))}
                                <button
                                    className={`filter-chip ${projectColor === null ? 'active' : ''}`}
                                    onClick={() => setProjectColor(null)}
                                    type="button"
                                >
                                    <span className="filter-chip-dot" style={{ background: 'var(--color-bg)', border: '2px dashed var(--color-text-muted)' }} />
                                    무순위
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 옵션 시트: 태그 */}
                    {editOptionSheet === 'tag' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>🏷️ 태그 설정</span>
                                <button type="button" onClick={() => setEditOptionSheet(null)}>✕</button>
                            </div>
                            <div style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                <div className="filter-chips" style={{ flexWrap: 'wrap', gap: 6 }}>
                                    {projectTags.map(tag => (
                                        <button key={tag} type="button" className="filter-chip active"
                                            onClick={() => setProjectTags(prev => prev.filter(t => t !== tag))}>
                                            🏷️ {tag} ×
                                        </button>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                    <input type="text" className="input-field" placeholder="새 태그"
                                        value={newProjectTag} onChange={e => setNewProjectTag(e.target.value)}
                                        style={{ flex: 1 }} />
                                    <button type="button" className="btn btn-primary btn-sm"
                                        disabled={!newProjectTag.trim()}
                                        onClick={() => {
                                            const t = newProjectTag.trim();
                                            if (t && !projectTags.includes(t)) setProjectTags(prev => [...prev, t]);
                                            setNewProjectTag('');
                                        }}>추가</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 옵션 시트: 활동명 */}
                    {editOptionSheet === 'displayName' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>📛 표시 이름 설정</span>
                                <button type="button" onClick={() => setEditOptionSheet(null)}>✕</button>
                            </div>
                            <div style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '0 0 8px' }}>
                                    활동명은 이 페이지 내에서만 사용되는 이름입니다.
                                </p>
                                <div className="filter-chips" style={{ gap: 6 }}>
                                    <button type="button"
                                        className={`filter-chip ${!editTarget?.useDisplayName ? 'active' : ''}`}
                                        onClick={async () => {
                                            try {
                                                await updateProjectDisplayNameMode(editTarget.id, false);
                                                setEditTarget(prev => ({ ...prev, useDisplayName: false }));
                                                addToast('닉네임 모드로 변경되었습니다.', 'success');
                                            } catch (e) { addToast('변경 실패', 'error'); }
                                        }}
                                    >닉네임 사용</button>
                                    <button type="button"
                                        className={`filter-chip ${editTarget?.useDisplayName ? 'active' : ''}`}
                                        onClick={async () => {
                                            try {
                                                await updateProjectDisplayNameMode(editTarget.id, true);
                                                setEditTarget(prev => ({ ...prev, useDisplayName: true }));
                                                addToast('활동명 모드로 변경되었습니다.', 'success');
                                            } catch (e) { addToast('변경 실패', 'error'); }
                                        }}
                                    >활동명 사용</button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="fullscreen-editor-body">
                        <input
                            type="text"
                            className="fullscreen-editor-title"
                            placeholder="페이지 이름"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            autoFocus
                        />
                        <textarea
                            className="fullscreen-editor-content"
                            placeholder="페이지 설명을 입력하세요"
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                        />
                    </div>
                </div>
            )}

            {/* DM(직접 메시지) 모달 */}
            <Modal
                isOpen={showDmModal}
                onClose={() => { setShowDmModal(false); setDmRecipient(''); setDmMessage(''); setDmSearchResult(null); }}
                title="메시지 보내기"
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => { setShowDmModal(false); setDmRecipient(''); setDmMessage(''); setDmSearchResult(null); }}>
                            취소
                        </button>
                        <button
                            className="btn btn-primary"
                            disabled={!dmSearchResult || !dmMessage.trim() || dmSending}
                            onClick={async () => {
                                if (!dmSearchResult || !dmMessage.trim()) return;
                                setDmSending(true);
                                try {
                                    await sendDirectMessage(profile.uid, dmSearchResult.id, dmMessage.trim());
                                    addToast('메시지를 보냈습니다', 'success');
                                    setShowDmModal(false);
                                    setDmRecipient(''); setDmMessage(''); setDmSearchResult(null);
                                } catch (e) {
                                    addToast('전송에 실패했습니다.', 'error');
                                }
                                setDmSending(false);
                            }}
                        >
                            {dmSending ? '전송 중...' : '보내기'}
                        </button>
                    </>
                }
            >
                <div className="input-group">
                    <label className="input-label">📧 받는 사람 (이메일 또는 닉네임)</label>
                    <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                        <input
                            className="input-field"
                            placeholder="이메일 또는 닉네임을 입력하세요"
                            value={dmRecipient}
                            onChange={(e) => { setDmRecipient(e.target.value); setDmSearchResult(null); }}
                            style={{ flex: 1 }}
                        />
                        <button
                            className="btn btn-primary btn-sm"
                            disabled={!dmRecipient.trim() || dmSearching}
                            onClick={async () => {
                                if (!dmRecipient.trim()) return;
                                setDmSearching(true);
                                const user = await findUserByNicknameOrEmail(dmRecipient.trim());
                                if (user && user.id === profile.uid) {
                                    setDmSearchResult(null);
                                    addToast('자기 자신에게는 메시지를 보낼 수 없습니다.', 'error');
                                } else {
                                    setDmSearchResult(user);
                                    if (!user) addToast('사용자를 찾을 수 없습니다.', 'error');
                                }
                                setDmSearching(false);
                            }}
                        >
                            {dmSearching ? '...' : '검색'}
                        </button>
                        {dmSearchResult && (
                            <button
                                className="btn btn-sm"
                                style={{ fontSize: '16px', padding: '2px 8px', minWidth: 'auto' }}
                                onClick={() => {
                                    const isFav = favoriteFriends.some(f => f.friendUid === dmSearchResult.id);
                                    if (isFav) {
                                        if (window.confirm('즐겨찾기를 해제하시겠습니까?')) removeFavoriteFriend(profile.uid, dmSearchResult.id);
                                    } else {
                                        addFavoriteFriend(profile.uid, dmSearchResult.id, dmSearchResult.nickname);
                                    }
                                }}
                                title="친구 즐겨찾기"
                            >
                                {favoriteFriends.some(f => f.friendUid === dmSearchResult.id) ? '⭐' : '☆'}
                            </button>
                        )}
                    </div>
                    {dmSearchResult && (
                        <div className="card" style={{ marginTop: 'var(--spacing-sm)', padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                            <strong>{dmSearchResult.nickname}</strong>
                            {dmRecipient.includes('@') && (
                                <span style={{ color: 'var(--color-text-secondary)', marginLeft: 'var(--spacing-sm)', fontSize: 'var(--font-size-sm)' }}>
                                    {dmSearchResult.email}
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
                        value={dmMessage}
                        onChange={(e) => setDmMessage(e.target.value)}
                        rows={4}
                        style={{ resize: 'vertical' }}
                    />
                </div>
            </Modal>

            {/* 업그레이드 모달 */}
            <UpgradeModal
                isOpen={showUpgradeModal}
                onClose={() => setShowUpgradeModal(false)}
                currentPlan={getUserPlan(profile)}
                reason={upgradeReason}
                profile={profile}
                onTrialStart={() => refreshProfile()}
            />
        </div>
    );
}
