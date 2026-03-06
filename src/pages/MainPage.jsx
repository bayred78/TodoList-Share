import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useToastStore from '../stores/toastStore';
import { subscribeToMyProjects, createProject, updateProject, updateMemberDisplayName, getRoleLabel, normalizeRole, getCachedProjects, deltaFetchProjects } from '../services/projectService';
import { subscribeToMyInvitations, subscribeToSentInvitations, acceptInvitation, rejectInvitation, cancelInvitation, inviteUser } from '../services/invitationService';
import { getUserPlan, getEffectivePlan, getUserLimits, LIMITS } from '../services/subscriptionService';
import UpgradeModal from '../components/common/UpgradeModal';
import Modal from '../components/common/Modal';
import PageHeader from '../components/common/PageHeader';
import { LABEL_COLORS, COLOR_MAP, normalizeColorId } from '../constants/colors';
import './MainPage.css';
import { toggleCheck, createTemplateItems } from '../services/todoService';
import {
    searchProjects, searchItems, sortResults, highlightText,
    getRecentSearches, addRecentSearch, clearRecentSearches, preloadAllItems
} from '../services/searchService';
import { sendDirectMessage } from '../services/chatService';
import { findUserByNicknameOrEmail } from '../services/userService';
import { subscribeToFavoriteItems, subscribeToFavoriteFriends, addFavoriteFriend, removeFavoriteFriend, updateFriendMemo, removeFavoriteItem } from '../services/favoriteService';
import { TEMPLATE_DATA } from '../data/templateData';

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

    // 활동명 (createProject용) — 선택 입력 (미입력 시 진입 후 프롬프트)
    const [displayNameInput, setDisplayNameInput] = useState('');

    // 새 페이지 생성 확장 State
    const [projectIcon, setProjectIcon] = useState(null);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [templateItems, setTemplateItems] = useState([]);
    const [inviteList, setInviteList] = useState([]);

    // 초대 시트 검색 state
    const [inviteSearch, setInviteSearch] = useState('');
    const [inviteSearchResult, setInviteSearchResult] = useState(null);
    const [inviteSearchLoading, setInviteSearchLoading] = useState(false);

    // 즐겨찾기 친구 추가 모달 state
    const [showAddFriendModal, setShowAddFriendModal] = useState(false);
    const [addFriendSearch, setAddFriendSearch] = useState('');
    const [addFriendResult, setAddFriendResult] = useState(null);
    const [addFriendLoading, setAddFriendLoading] = useState(false);

    // 편집 모달 변경사항 미저장 확인
    const [showUnsavedEditModal, setShowUnsavedEditModal] = useState(false);

    // 실효 플랜 제한
    const effectiveLimits = useMemo(() => getUserLimits(profile), [profile]);

    // 글자수 포인트 계산 (한글=2, 영문=1, 최대 12포인트)
    const getNamePoints = (str) => {
        let points = 0;
        for (const ch of str) {
            points += /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(ch) ? 2 : 1;
        }
        return points;
    };

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
    const [sortBy, setSortBy] = useState('newest');
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
    const [pageSortBy, setPageSortBy] = useState('newest');
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

    // 생성 폼 초기화 (R-07)
    const resetCreateForm = () => {
        setProjectColor(null); setProjectTags([]); setNewProjectTag('');
        setDisplayNameInput(''); setProjectIcon(null); setSelectedTemplate(null);
        setTemplateItems([]); setInviteList([]); setCreateOptionSheet(null);
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
        const limit = effectiveLimits.maxPages;
        if (myOwnedProjects.length >= limit) {
            setUpgradeReason('maxPages');
            setShowUpgradeModal(true);
            return;
        }
        if (displayNameInput.trim() && displayNameInput.trim().length < 2) {
            addToast('활동명은 최소 2자 이상 입력해주세요.', 'warning');
            return;
        }
        if (displayNameInput.trim() && getNamePoints(displayNameInput.trim()) > 12) {
            addToast('활동명이 너무 깁니다. (한글 6자/영문 12자 이내)', 'warning');
            return;
        }
        setCreating(true);
        try {
            const projectId = await createProject(profile.uid, profile.nickname, projectName.trim(), projectDesc.trim(), actualPlan, displayNameInput.trim(), projectIcon);

            // 부가 작업 — 하나 실패해도 프로젝트 생성은 유지 (R-01)
            const tasks = [];
            // R-02: updateProject 병합 (2회→1회)
            const updateFields = {};
            if (projectColor) updateFields.color = projectColor;
            if (projectTags.length > 0) updateFields.projectTags = projectTags;
            if (Object.keys(updateFields).length > 0) {
                tasks.push(updateProject(projectId, updateFields));
            }
            if (templateItems.length > 0) {
                tasks.push(createTemplateItems(projectId, templateItems, { uid: profile.uid, nickname: profile.nickname }));
            }
            if (inviteList.length > 0) {
                tasks.push(...inviteList.map(inv =>
                    inviteUser(projectId, projectName.trim(), profile.uid, profile.nickname, inv.uid, inv.nickname, inv.role || 'editor')
                ));
            }
            if (tasks.length > 0) {
                const results = await Promise.allSettled(tasks);
                const failures = results.filter(r => r.status === 'rejected');
                if (failures.length > 0) {
                    console.error('부가 작업 일부 실패:', failures);
                    addToast(`페이지는 생성되었으나 ${failures.length}개 설정이 실패했습니다.`, 'warning');
                }
            }
            setShowCreateModal(false);
            setProjectName('');
            setProjectDesc('');
            resetCreateForm();
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

    // B-3: 초대 시트 닉네임/이메일 검색
    const handleInviteSearch = async () => {
        if (!inviteSearch.trim()) return;
        setInviteSearchLoading(true);
        setInviteSearchResult(null);
        try {
            const result = await findUserByNicknameOrEmail(inviteSearch.trim());
            if (!result) addToast('사용자를 찾을 수 없습니다.', 'warning');
            else if (result.id === profile.uid) addToast('자기 자신은 초대할 수 없습니다.', 'warning');
            else setInviteSearchResult(result);
        } catch (err) { console.error('[inviteSearch 오류]', err); addToast('검색에 실패했습니다.', 'error'); }
        finally { setInviteSearchLoading(false); }
    };

    // 즐겨찾기 친구 추가 검색
    const handleAddFriendSearch = async () => {
        if (!addFriendSearch.trim()) return;
        setAddFriendLoading(true);
        setAddFriendResult(null);
        try {
            const result = await findUserByNicknameOrEmail(addFriendSearch.trim());
            if (!result) addToast('사용자를 찾을 수 없습니다.', 'warning');
            else if (result.id === profile.uid) addToast('자기 자신은 추가할 수 없습니다.', 'warning');
            else setAddFriendResult(result);
        } catch (err) { console.error('[addFriendSearch 오류]', err); addToast('검색에 실패했습니다.', 'error'); }
        finally { setAddFriendLoading(false); }
    };

    // 편집 모달 변경 감지
    const isEditDirty = useCallback(() => {
        if (!editTarget) return false;
        if (editName !== editTarget.name) return true;
        if (editDesc !== (editTarget.description || '')) return true;
        if (projectColor !== (editTarget.color || null)) return true;
        const origTags = editTarget.projectTags || [];
        if (projectTags.length !== origTags.length ||
            !projectTags.every(t => origTags.includes(t))) return true;
        if (projectIcon !== (editTarget.icon || null)) return true;
        const origDN = editTarget.members?.[profile?.uid]?.displayName || '';
        if (displayNameInput !== origDN) return true;
        if (inviteList.length > 0) return true;
        return false;
    }, [editTarget, editName, editDesc, projectColor, projectTags, projectIcon, displayNameInput, inviteList, profile]);

    // 페이지 수정
    const handleEditOpen = (e, project) => {
        e.stopPropagation();
        setEditTarget(project);
        setEditName(project.name);
        setEditDesc(project.description || '');
        setProjectColor(project.color || null);
        setProjectTags(project.projectTags || []);
        setNewProjectTag('');
        setProjectIcon(project.icon || null);
        setDisplayNameInput(project.members?.[profile.uid]?.displayName || '');
        setInviteList([]);
        setInviteSearch(''); setInviteSearchResult(null);
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
                icon: projectIcon || null,
            });
            // B-1: 활동명 변경 (members 서브필드)
            const oldDN = editTarget.members?.[profile.uid]?.displayName || '';
            if (displayNameInput.trim() !== oldDN) {
                await updateMemberDisplayName(editTarget.id, profile.uid, displayNameInput.trim()).catch(() => { });
            }
            // B-1: 초대 발송
            if (inviteList.length > 0) {
                await Promise.allSettled(inviteList.map(inv =>
                    inviteUser(editTarget.id, editName.trim(), profile.uid, profile.nickname,
                        inv.uid, inv.nickname, inv.role || 'editor')
                ));
            }
            addToast('페이지 정보가 수정되었습니다.', 'success');
            setEditOptionSheet(null);
            setShowEditModal(false);
            setProjectIcon(null); setDisplayNameInput(''); setInviteList([]);
            setProjectTags([]); setNewProjectTag('');
        } catch (error) {
            addToast('페이지 수정에 실패했습니다.', 'error');
        } finally {
            setSaving(false);
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
                <PageHeader>
                    <div className="flex-row-gap-sm">
                        <div style={{ width: 40, flexShrink: 0 }} />
                        <h1>TodoList Share</h1>
                    </div>
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
                </PageHeader>

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
                                    if (searchType === 'page') {
                                        setShowPageFilters(p => !p); // 이미 선택된 상태면 필터 토글
                                    } else {
                                        setSearchType('page');
                                        setSearchKeyword('');
                                        const res = searchProjects(projects, '', pageFilters);
                                        setSearchResults(sortResults(res, pageSortBy));
                                        setShowPageFilters(true); // 탭 전환 시 필터 열기 가능 (선택적)
                                    }
                                }}>
                                📄 페이지 검색 {hasActivePageFilters && `(${pageFilterCount})`}
                            </button>
                            <button className={`search-type-btn ${searchType === 'checklist' ? 'active' : ''}`}
                                onClick={() => {
                                    if (searchType === 'checklist') {
                                        setShowFilters(p => !p); // 이미 선택된 상태면 필터 토글
                                    } else {
                                        setSearchType('checklist');
                                        setSearchKeyword('');
                                        const res = searchItems(projects, '', filters);
                                        setSearchResults(sortResults(res, sortBy));
                                        setShowFilters(true); // 탭 전환 시 필터 열기 가능 (선택적)
                                    }
                                }}>
                                ✅ 체크리스트 검색 {hasActiveFilters && `(${activeFilterCount})`}
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


                        {/* ── 공통 툴바: [최근검색어] ── */}
                        <div className="search-toolbar">
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

                        {/* 결과 헤더 (결과 수 + 정렬 드롭다운) */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-sm)' }}>
                            <div className="search-result-count" style={{ marginBottom: 0 }}>
                                {searchLoading ? '검색 중...'
                                    : searchKeyword.trim().length >= 1
                                        ? `검색 결과 ${searchResults.length}건`
                                        : `전체 ${searchResults.length}건`}
                            </div>
                            <select className="search-sort-select"
                                value={searchType === 'page' ? pageSortBy : sortBy}
                                onChange={e => searchType === 'page'
                                    ? setPageSortBy(e.target.value) : setSortBy(e.target.value)}>
                                <option value="newest">최신순</option>
                                <option value="oldest">오래된순</option>
                                <option value="name">이름순</option>
                                {searchType === 'checklist' && <option value="dueDate">마감일순</option>}
                            </select>
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
                                            <h3 className="project-card-name">
                                                {project.icon && <span style={{ marginRight: 'var(--spacing-xs)' }}>{project.icon}</span>}
                                                {project.name}
                                            </h3>
                                            <div className="project-card-badges">
                                                {project.ownerId === profile?.uid && (
                                                    <button
                                                        className="card-edit-btn"
                                                        onClick={(e) => handleEditOpen(e, project)}
                                                        title="페이지 수정"
                                                    >✏️</button>
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
                                                <div className="fav-item-info-row">
                                                    <span className="fav-item-project">{fav.projectName}</span>
                                                    <span className="fav-item-title">{fav.title}</span>
                                                </div>
                                                <button className="fav-remove-btn" onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (window.confirm('즐겨찾기를 해제하시겠습니까?')) {
                                                        removeFavoriteItem(profile.uid, fav.projectId, fav.itemId);
                                                    }
                                                }} title="즐겨찾기 해제">⭐</button>
                                            </div>
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
                                                    <div className="friend-name-row">
                                                        <span className="friend-nickname">{friend.nickname}</span>
                                                        {editingMemoId !== friend.id && friend.memo && (
                                                            <span className="friend-memo-inline">({friend.memo})</span>
                                                        )}
                                                    </div>
                                                    <div className="friend-actions">
                                                        {editingMemoId !== friend.id && (
                                                            <button className="btn btn-secondary btn-sm" onClick={() => {
                                                                setEditingMemoId(friend.id);
                                                                setMemoInput(friend.memo || '');
                                                            }}>별명 편집</button>
                                                        )}
                                                        <button className="btn btn-primary btn-sm" onClick={() => {
                                                            setDmRecipient(friend.nickname);
                                                            setDmSearchResult({ id: friend.friendUid, nickname: friend.nickname });
                                                            setDmMessage('');
                                                            setShowDmModal(true);
                                                        }}>💬</button>
                                                        <button className="fav-remove-btn" onClick={() => { if (window.confirm('즐겨찾기를 해제하시겠습니까?')) removeFavoriteFriend(profile.uid, friend.friendUid); }} title="즐겨찾기 해제">⭐</button>
                                                    </div>
                                                </div>
                                                {editingMemoId === friend.id && (
                                                    <div className="friend-memo-row">
                                                        <input
                                                            className="input-field friend-memo-input"
                                                            value={memoInput}
                                                            onChange={(e) => setMemoInput(e.target.value)}
                                                            placeholder="별명 입력"
                                                        />
                                                        <button className="btn btn-primary btn-sm" onClick={async () => {
                                                            try {
                                                                await updateFriendMemo(profile.uid, friend.id, memoInput);
                                                                setEditingMemoId(null);
                                                            } catch (e) {
                                                                addToast('별명 저장에 실패했습니다.', 'error');
                                                            }
                                                        }}>저장</button>
                                                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingMemoId(null)}>취소</button>
                                                    </div>
                                                )}
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
                                        <div className="invitation-info">
                                            <h3 className="invitation-project">{invite.projectName}</h3>
                                            <p className="invitation-from">
                                                → {invite.inviteeNickname}님에게 초대
                                            </p>
                                            <div className="invitation-detail flex-row-wrap-xs">
                                                {getStatusBadge(invite.status)}
                                                <span className="badge badge-primary margin-l-xs">{getRoleLabel(normalizeRole(invite.role))}</span>
                                                {invite.createdAt && <span className="invitation-time">{formatTime(invite.createdAt)}</span>}
                                                <span className="flex-row-center margin-l-auto">
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
                                                </span>
                                            </div>
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
                                            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 'var(--spacing-xs) 0 0' }}>
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
                                        <div className="invitation-info">
                                            <h3 className="invitation-project">{noti.projectName}</h3>
                                            <p className="invitation-from">{noti.text}</p>
                                            <div className="flex-row-center margin-t-sm">
                                                {noti.createdAt && (
                                                    <span className="invitation-time margin-l-auto">{formatTime(new Date(noti.createdAt))}</span>
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
                                        <div className="invitation-info">
                                            <h3 className="invitation-project">{dm.senderNickname}</h3>
                                            <p className="invitation-from" style={{ whiteSpace: 'pre-wrap' }}>{dm.message}</p>
                                            <div className="flex-row-center margin-t-sm">
                                                {dm.createdAt && (
                                                    <span className="invitation-time margin-l-auto">{formatTime(dm.createdAt)}</span>
                                                )}
                                                <button className="btn btn-sm" style={{ fontSize: 'var(--font-size-lg)', padding: 'var(--spacing-xs) var(--spacing-sm)', minWidth: 'auto' }}
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
                } else if (activeTab === 'favorites' && favSubTab === 'friends') {
                    setAddFriendSearch(''); setAddFriendResult(null);
                    setShowAddFriendModal(true);
                } else {
                    resetCreateForm(); setShowCreateModal(true);
                }
            }} title={activeTab === 'requests' ? '메시지 보내기'
                : activeTab === 'favorites' && favSubTab === 'friends' ? '친구 추가' : '새 페이지'}>
                {activeTab === 'requests' ? '✉️'
                    : activeTab === 'favorites' && favSubTab === 'friends' ? '👤+' : '+'}
            </button>

            {/* 페이지 생성 - 전체화면 에디터 */}
            {showCreateModal && (
                <div className="fullscreen-editor">
                    <div className="fullscreen-editor-header">
                        <button className="fullscreen-editor-back" onClick={() => { resetCreateForm(); setShowCreateModal(false); }}>←</button>
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
                            {displayNameInput && <span className="edit-toolbar-count">✓</span>}
                        </button>
                        <button
                            type="button"
                            className={`edit-toolbar-btn ${createOptionSheet === 'icon' ? 'active' : ''}`}
                            onClick={() => {
                                if (!effectiveLimits.representativeIcon) {
                                    setUpgradeReason('representativeIcon');
                                    setShowUpgradeModal(true);
                                    return;
                                }
                                setCreateOptionSheet(createOptionSheet === 'icon' ? null : 'icon');
                            }}
                        >
                            <span>{projectIcon || '🏠'}</span><span className="edit-toolbar-label">아이콘</span>
                        </button>
                        <button
                            type="button"
                            className={`edit-toolbar-btn ${createOptionSheet === 'template' ? 'active' : ''}`}
                            onClick={() => setCreateOptionSheet(createOptionSheet === 'template' ? null : 'template')}
                        >
                            <span>📋</span><span className="edit-toolbar-label">템플릿</span>
                            {templateItems.length > 0 && <span className="edit-toolbar-count">{templateItems.length}</span>}
                        </button>
                        <button
                            type="button"
                            className={`edit-toolbar-btn ${createOptionSheet === 'invite' ? 'active' : ''}`}
                            onClick={() => setCreateOptionSheet(createOptionSheet === 'invite' ? null : 'invite')}
                        >
                            <span>✉️</span><span className="edit-toolbar-label">초대</span>
                            {inviteList.length > 0 && <span className="edit-toolbar-count">{inviteList.length}</span>}
                        </button>
                    </div>

                    {/* 옵션 시트: 중요도 */}
                    {createOptionSheet === 'color' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>🏅 중요도 선택</span>
                                <button type="button" onClick={() => setCreateOptionSheet(null)}>✕</button>
                            </div>
                            <div className="filter-chips" style={{ flexWrap: 'wrap', gap: 'var(--spacing-xs)', padding: 'var(--spacing-sm) var(--spacing-md)' }}>
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
                                <div className="filter-chips" style={{ flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
                                    {projectTags.map(tag => (
                                        <button key={tag} type="button" className="filter-chip active"
                                            onClick={() => setProjectTags(prev => prev.filter(t => t !== tag))}>
                                            🏷️ {tag} ×
                                        </button>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: 'var(--spacing-xs)', marginTop: 'var(--spacing-xs)' }}>
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
                                <span>📛 활동명</span>
                                <button type="button" onClick={() => setCreateOptionSheet(null)}>✕</button>
                            </div>
                            <div style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '0 0 var(--spacing-xs)' }}>
                                    이 페이지 내에서 사용할 이름입니다. (한글 6자/영문 12자 이내)
                                </p>
                                <div style={{ display: 'flex', gap: 'var(--spacing-xs)', alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        className="input-field flex-1"
                                        placeholder="활동명을 입력하세요"
                                        value={displayNameInput}
                                        onChange={e => setDisplayNameInput(e.target.value)}
                                        maxLength={12}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setDisplayNameInput(profile?.nickname || '')}
                                        title="닉네임을 활동명으로 사용"
                                    >
                                        닉네임 사용
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 옵션 시트: 대표 아이콘 */}
                    {createOptionSheet === 'icon' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>🏠 대표 아이콘 선택</span>
                                <button type="button" onClick={() => setCreateOptionSheet(null)}>✕</button>
                            </div>
                            <div className="filter-chips" style={{ flexWrap: 'wrap', gap: 'var(--spacing-xs)', padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                {['📋', '📝', '🎯', '📅', '🏠', '💼', '🎓', '🏋️', '🍳', '🎵', '🎨', '📸', '✈️', '💰', '🛒', '❤️', '🐾', '🌱', '📚', '⚙️'].map(icon => (
                                    <button
                                        key={icon}
                                        type="button"
                                        className={`filter-chip ${projectIcon === icon ? 'active' : ''}`}
                                        onClick={() => setProjectIcon(projectIcon === icon ? null : icon)}
                                        style={{ fontSize: 'var(--font-size-lg)' }}
                                    >
                                        {icon}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    className={`filter-chip ${projectIcon === null ? 'active' : ''}`}
                                    onClick={() => setProjectIcon(null)}
                                >
                                    없음
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 옵션 시트: 템플릿 */}
                    {createOptionSheet === 'template' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>📋 템플릿 선택</span>
                                <button type="button" onClick={() => setCreateOptionSheet(null)}>✕</button>
                            </div>
                            <div style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                <select
                                    className="input-field"
                                    value={selectedTemplate || ''}
                                    onChange={e => {
                                        const cat = e.target.value;
                                        setSelectedTemplate(cat || null);
                                        setTemplateItems([]);
                                        if (cat) setProjectName('');
                                    }}
                                    style={{ marginBottom: 'var(--spacing-sm)' }}
                                >
                                    <option value="">대분류 선택...</option>
                                    <option value="친구">👫 친구</option>
                                    <option value="가족">👨‍👩‍👧‍👦 가족</option>
                                    <option value="업무">💼 업무</option>
                                    <option value="학습">📚 학습</option>
                                    <option value="건강">🏋️ 건강/운동</option>
                                    <option value="취미">🎨 취미</option>
                                    <option value="여행">✈️ 여행</option>
                                    <option value="재정">💰 재정/가계부</option>
                                </select>
                                {selectedTemplate && (
                                    <div className="filter-chips" style={{ flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
                                        {(TEMPLATE_DATA[selectedTemplate] || []).map(tpl => (
                                            <button
                                                key={tpl.title}
                                                type="button"
                                                className={`filter-chip ${projectName === tpl.title ? 'active' : ''}`}
                                                onClick={() => {
                                                    setProjectName(tpl.title);
                                                    setProjectDesc(tpl.desc || '');
                                                    setTemplateItems(tpl.items || []);
                                                }}
                                            >
                                                {tpl.title}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {templateItems.length > 0 && (
                                    <div style={{ marginTop: 'var(--spacing-sm)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                                        ✅ 체크리스트 {templateItems.length}개 자동 등록 예정
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 옵션 시트: 초대 */}
                    {createOptionSheet === 'invite' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>✉️ 멤버 초대</span>
                                <button type="button" onClick={() => setCreateOptionSheet(null)}>✕</button>
                            </div>
                            <div style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                {/* 즐겨찾기 친구 빠른 추가 */}
                                {favoriteFriends.length > 0 && (
                                    <div style={{ marginBottom: 'var(--spacing-sm)' }}>
                                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-xs)' }}>⭐ 즐겨찾기 친구</p>
                                        <div className="filter-chips" style={{ flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
                                            {favoriteFriends.map(friend => {
                                                const already = inviteList.some(inv => inv.uid === friend.friendUid);
                                                return (
                                                    <button
                                                        key={friend.friendUid}
                                                        type="button"
                                                        className={`filter-chip ${already ? 'active' : ''}`}
                                                        onClick={() => {
                                                            if (already) {
                                                                setInviteList(prev => prev.filter(inv => inv.uid !== friend.friendUid));
                                                            } else {
                                                                setInviteList(prev => [...prev, { uid: friend.friendUid, nickname: friend.friendNickname || friend.nickname || '', role: 'editor' }]);
                                                            }
                                                        }}
                                                    >
                                                        {already ? '✓ ' : ''}{friend.friendNickname || friend.nickname || '(이름없음)'}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {/* B-3: 닉네임/이메일 검색 */}
                                <div style={{ marginTop: 'var(--spacing-sm)' }}>
                                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-xs)' }}>🔍 닉네임 또는 이메일로 검색</p>
                                    <div className="flex-row-gap-xs">
                                        <input className="input-field flex-1" placeholder="닉네임 또는 이메일 입력"
                                            value={inviteSearch} onChange={e => setInviteSearch(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleInviteSearch()} />
                                        <button type="button" className="btn btn-secondary btn-sm"
                                            onClick={handleInviteSearch} disabled={inviteSearchLoading}>
                                            {inviteSearchLoading ? '...' : '검색'}
                                        </button>
                                    </div>
                                    {inviteSearchResult && (
                                        <div style={{ marginTop: 'var(--spacing-xs)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                                            <span style={{ flex: 1, fontSize: 'var(--font-size-sm)' }}>{inviteSearchResult.nickname}</span>
                                            <button type="button" className="btn btn-primary btn-xs"
                                                disabled={inviteList.some(i => i.uid === inviteSearchResult.id)}
                                                onClick={() => {
                                                    setInviteList(prev => [...prev,
                                                    { uid: inviteSearchResult.id, nickname: inviteSearchResult.nickname, role: 'editor' }]);
                                                    setInviteSearch(''); setInviteSearchResult(null);
                                                }}>
                                                {inviteList.some(i => i.uid === inviteSearchResult.id) ? '✓ 추가됨' : '+ 추가'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {/* 초대 목록 */}
                                {inviteList.length > 0 && (
                                    <div style={{ marginTop: 'var(--spacing-sm)' }}>
                                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-xs)' }}>초대 목록</p>
                                        {inviteList.map(inv => (
                                            <div key={inv.uid} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', marginBottom: 'var(--spacing-xs)' }}>
                                                <span style={{ flex: 1, fontSize: 'var(--font-size-sm)' }}>{inv.nickname}</span>
                                                <select
                                                    className="input-field"
                                                    style={{ width: 'auto', fontSize: 'var(--font-size-xs)' }}
                                                    value={inv.role}
                                                    onChange={e => setInviteList(prev => prev.map(i => i.uid === inv.uid ? { ...i, role: e.target.value } : i))}
                                                >
                                                    <option value="editor">편집자</option>
                                                    {effectiveLimits.viewerRole && <option value="viewer">독자</option>}
                                                </select>
                                                <button type="button" className="btn btn-danger btn-xs" onClick={() => setInviteList(prev => prev.filter(i => i.uid !== inv.uid))}>✕</button>
                                            </div>
                                        ))}
                                    </div>
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
                        <button className="fullscreen-editor-back" onClick={() => {
                            if (isEditDirty()) { setShowUnsavedEditModal(true); return; }
                            setEditOptionSheet(null); setShowEditModal(false);
                            setProjectTags([]); setNewProjectTag('');
                            setProjectIcon(null); setDisplayNameInput(''); setInviteList([]);
                        }}>←</button>
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
                        <button type="button"
                            className={`edit-toolbar-btn ${editOptionSheet === 'displayName' ? 'active' : ''}`}
                            onClick={() => setEditOptionSheet(editOptionSheet === 'displayName' ? null : 'displayName')}>
                            <span>📛</span><span className="edit-toolbar-label">활동명</span>
                            {displayNameInput && <span className="edit-toolbar-count">✓</span>}
                        </button>
                        <button type="button"
                            className={`edit-toolbar-btn ${editOptionSheet === 'icon' ? 'active' : ''}`}
                            onClick={() => {
                                if (!effectiveLimits.representativeIcon) {
                                    setUpgradeReason('representativeIcon'); setShowUpgradeModal(true); return;
                                }
                                setEditOptionSheet(editOptionSheet === 'icon' ? null : 'icon');
                            }}>
                            <span>{projectIcon || '🏠'}</span><span className="edit-toolbar-label">아이콘</span>
                        </button>
                        <button type="button" className="edit-toolbar-btn" disabled style={{ opacity: 0.4, cursor: 'not-allowed' }}>
                            <span>📋</span><span className="edit-toolbar-label">템플릿</span>
                        </button>
                        <button type="button"
                            className={`edit-toolbar-btn ${editOptionSheet === 'invite' ? 'active' : ''}`}
                            onClick={() => setEditOptionSheet(editOptionSheet === 'invite' ? null : 'invite')}>
                            <span>✉️</span><span className="edit-toolbar-label">초대</span>
                            {inviteList.length > 0 && <span className="edit-toolbar-count">{inviteList.length}</span>}
                        </button>
                    </div>

                    {/* 옵션 시트: 중요도 */}
                    {editOptionSheet === 'color' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>🏅 중요도 선택</span>
                                <button type="button" onClick={() => setEditOptionSheet(null)}>✕</button>
                            </div>
                            <div className="filter-chips padding-y-sm-x-md" style={{ flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
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
                            <div className="padding-y-sm-x-md">
                                <div className="filter-chips" style={{ flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
                                    {projectTags.map(tag => (
                                        <button key={tag} type="button" className="filter-chip active"
                                            onClick={() => setProjectTags(prev => prev.filter(t => t !== tag))}>
                                            🏷️ {tag} ×
                                        </button>
                                    ))}
                                </div>
                                <div className="flex-row-gap-xs margin-t-xs">
                                    <input type="text" className="input-field flex-1" placeholder="새 태그"
                                        value={newProjectTag} onChange={e => setNewProjectTag(e.target.value)} />
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

                    {/* 옵션 시트: 활동명 (편집) */}
                    {editOptionSheet === 'displayName' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>📛 활동명</span>
                                <button type="button" onClick={() => setEditOptionSheet(null)}>✕</button>
                            </div>
                            <div style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '0 0 var(--spacing-xs)' }}>
                                    이 페이지 내에서 사용할 이름입니다. (한글 6자/영문 12자 이내)
                                </p>
                                <div style={{ display: 'flex', gap: 'var(--spacing-xs)', alignItems: 'center' }}>
                                    <input type="text" className="input-field flex-1" placeholder="활동명을 입력하세요"
                                        value={displayNameInput} onChange={e => setDisplayNameInput(e.target.value)} maxLength={12} />
                                    <button type="button" className="btn btn-secondary btn-sm"
                                        onClick={() => setDisplayNameInput(profile?.nickname || '')} title="닉네임을 활동명으로 사용">
                                        닉네임 사용
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 옵션 시트: 대표 아이콘 (편집) */}
                    {editOptionSheet === 'icon' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>🏠 대표 아이콘 선택</span>
                                <button type="button" onClick={() => setEditOptionSheet(null)}>✕</button>
                            </div>
                            <div className="filter-chips" style={{ flexWrap: 'wrap', gap: 'var(--spacing-xs)', padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                {['📋', '📝', '🎯', '📅', '🏠', '💼', '🎓', '🏋️', '🍳', '🎵', '🎨', '📸', '✈️', '💰', '🛒', '❤️', '🐾', '🌱', '📚', '⚙️'].map(icon => (
                                    <button key={icon} type="button"
                                        className={`filter-chip ${projectIcon === icon ? 'active' : ''}`}
                                        onClick={() => setProjectIcon(projectIcon === icon ? null : icon)}
                                        style={{ fontSize: 'var(--font-size-lg)' }}>
                                        {icon}
                                    </button>
                                ))}
                                <button type="button"
                                    className={`filter-chip ${projectIcon === null ? 'active' : ''}`}
                                    onClick={() => setProjectIcon(null)}>
                                    없음
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 옵션 시트: 초대 (편집) */}
                    {editOptionSheet === 'invite' && (
                        <div className="edit-option-sheet">
                            <div className="edit-option-sheet-header">
                                <span>✉️ 구성원 초대</span>
                                <button type="button" onClick={() => setEditOptionSheet(null)}>✕</button>
                            </div>
                            <div style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                {/* 즐겨찾기 친구 빠른 추가 */}
                                {favoriteFriends.length > 0 && (
                                    <div style={{ marginBottom: 'var(--spacing-sm)' }}>
                                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-xs)' }}>⭐ 즐겨찾기 친구</p>
                                        <div className="filter-chips" style={{ flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
                                            {favoriteFriends.map(friend => {
                                                const already = inviteList.some(inv => inv.uid === friend.friendUid);
                                                return (
                                                    <button key={friend.friendUid} type="button"
                                                        className={`filter-chip ${already ? 'active' : ''}`}
                                                        onClick={() => {
                                                            if (already) setInviteList(prev => prev.filter(inv => inv.uid !== friend.friendUid));
                                                            else setInviteList(prev => [...prev, { uid: friend.friendUid, nickname: friend.friendNickname || friend.nickname || '', role: 'editor' }]);
                                                        }}>
                                                        {already ? '✓ ' : ''}{friend.friendNickname || friend.nickname || '(이름없음)'}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {/* 닉네임/이메일 검색 */}
                                <div style={{ marginTop: 'var(--spacing-sm)' }}>
                                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-xs)' }}>🔍 닉네임 또는 이메일로 검색</p>
                                    <div className="flex-row-gap-xs">
                                        <input className="input-field flex-1" placeholder="닉네임 또는 이메일 입력"
                                            value={inviteSearch} onChange={e => setInviteSearch(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleInviteSearch()} />
                                        <button type="button" className="btn btn-secondary btn-sm"
                                            onClick={handleInviteSearch} disabled={inviteSearchLoading}>
                                            {inviteSearchLoading ? '...' : '검색'}
                                        </button>
                                    </div>
                                    {inviteSearchResult && (
                                        <div style={{ marginTop: 'var(--spacing-xs)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                                            <span style={{ flex: 1, fontSize: 'var(--font-size-sm)' }}>{inviteSearchResult.nickname}</span>
                                            <button type="button" className="btn btn-primary btn-xs"
                                                disabled={inviteList.some(i => i.uid === inviteSearchResult.id)}
                                                onClick={() => {
                                                    setInviteList(prev => [...prev, { uid: inviteSearchResult.id, nickname: inviteSearchResult.nickname, role: 'editor' }]);
                                                    setInviteSearch(''); setInviteSearchResult(null);
                                                }}>
                                                {inviteList.some(i => i.uid === inviteSearchResult.id) ? '✓ 추가됨' : '+ 추가'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {/* 초대 목록 */}
                                {inviteList.length > 0 && (
                                    <div style={{ marginTop: 'var(--spacing-sm)' }}>
                                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-xs)' }}>초대 목록</p>
                                        {inviteList.map(inv => (
                                            <div key={inv.uid} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', marginBottom: 'var(--spacing-xs)' }}>
                                                <span style={{ flex: 1, fontSize: 'var(--font-size-sm)' }}>{inv.nickname}</span>
                                                <select className="input-field" style={{ width: 'auto', fontSize: 'var(--font-size-xs)' }}
                                                    value={inv.role} onChange={e => setInviteList(prev => prev.map(i => i.uid === inv.uid ? { ...i, role: e.target.value } : i))}>
                                                    <option value="editor">편집자</option>
                                                    {effectiveLimits.viewerRole && <option value="viewer">독자</option>}
                                                </select>
                                                <button type="button" className="btn btn-danger btn-xs" onClick={() => setInviteList(prev => prev.filter(i => i.uid !== inv.uid))}>✕</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
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
                            className="input-field flex-1"
                            placeholder="이메일 또는 닉네임을 입력하세요"
                            value={dmRecipient}
                            onChange={(e) => { setDmRecipient(e.target.value); setDmSearchResult(null); }}
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
                                style={{ fontSize: 'var(--font-size-lg)', padding: 'var(--spacing-xs) var(--spacing-md)', minWidth: 'auto' }}
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
                        <div className="card padding-y-sm-x-md margin-t-sm">
                            <strong>{dmSearchResult.nickname}</strong>
                            {dmRecipient.includes('@') && (
                                <span className="meta-text-sm" style={{ marginLeft: 'var(--spacing-sm)' }}>
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

            {/* 친구 즐겨찾기 추가 모달 */}
            <Modal
                isOpen={showAddFriendModal}
                onClose={() => { setShowAddFriendModal(false); setAddFriendSearch(''); setAddFriendResult(null); }}
                title="👤 친구 즐겨찾기 추가"
                footer={
                    <>
                        <button className="btn btn-secondary"
                            onClick={() => { setShowAddFriendModal(false); setAddFriendSearch(''); setAddFriendResult(null); }}>
                            취소
                        </button>
                        <button className="btn btn-primary"
                            disabled={!addFriendResult || addFriendLoading}
                            onClick={async () => {
                                if (!addFriendResult) return;
                                await addFavoriteFriend(profile.uid, addFriendResult.id, addFriendResult.nickname);
                                addToast('즐겨찾기에 추가되었습니다.', 'success');
                                setShowAddFriendModal(false);
                                setAddFriendSearch(''); setAddFriendResult(null);
                            }}>
                            즐겨찾기 추가
                        </button>
                    </>
                }
            >
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-sm)' }}>
                    닉네임 또는 이메일로 검색하여 즐겨찾기에 추가합니다
                </p>
                <div className="flex-row-gap-xs">
                    <input className="input-field flex-1" placeholder="닉네임 또는 이메일"
                        value={addFriendSearch}
                        onChange={e => setAddFriendSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddFriendSearch()} />
                    <button className="btn btn-secondary btn-sm"
                        onClick={handleAddFriendSearch} disabled={addFriendLoading}>
                        {addFriendLoading ? '...' : '검색'}
                    </button>
                </div>
                {addFriendResult && (
                    <div style={{ marginTop: 'var(--spacing-sm)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                        <span style={{ flex: 1 }}>{addFriendResult.nickname}</span>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>추가 버튼을 눌러 추가하세요</span>
                    </div>
                )}
            </Modal>


            {/* 편집 수정사항 확인 모달 */}
            {showUnsavedEditModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'var(--color-overlay, rgba(0,0,0,0.5))', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', zIndex: 'var(--z-toast)',
                }}>
                    <div style={{
                        background: 'var(--color-bg-elevated, #fff)', borderRadius: 'var(--radius-lg, 12px)',
                        padding: 'var(--spacing-lg, 24px)', maxWidth: '320px', width: '90%',
                        boxShadow: 'var(--shadow-lg)', textAlign: 'center',
                    }}>
                        <p style={{ fontSize: 'var(--font-size-md, 16px)', fontWeight: 600, marginBottom: 'var(--spacing-sm)', color: 'var(--color-text)' }}>
                            수정사항이 있습니다.
                        </p>
                        <p style={{ fontSize: 'var(--font-size-sm, 14px)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-lg)' }}>
                            저장하시겠습니까?
                        </p>
                        <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                            <button className="btn btn-secondary" style={{ flex: 1 }}
                                onClick={() => {
                                    setShowUnsavedEditModal(false); setShowEditModal(false);
                                    setEditOptionSheet(null); setProjectTags([]); setNewProjectTag('');
                                    setProjectIcon(null); setDisplayNameInput(''); setInviteList([]);
                                }}>나가기</button>
                            <button className="btn btn-secondary" style={{ flex: 1 }}
                                onClick={() => setShowUnsavedEditModal(false)}>취소</button>
                            <button className="btn btn-primary" style={{ flex: 1 }}
                                onClick={() => { setShowUnsavedEditModal(false); handleSaveEdit(); }}>저장</button>
                        </div>
                    </div>
                </div>
            )}

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
