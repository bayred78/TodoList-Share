/**
 * 검색 서비스 — 페이지/체크리스트 통합 검색
 * Firebase 비용 절감: 클라이언트 캐시 우선, 미캐시 프로젝트는 수동 로드
 */
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { getCachedItems } from './todoService';

// ===== 검색 전용 세션 캐시 (todoService.setCachedItems는 비공개) =====
const searchCacheMap = new Map();

// ===== 페이지 검색 (Firebase 읽기 0건) =====
export function searchProjects(projects, keyword, filters = {}) {
    const lower = (keyword || '').trim().toLowerCase();
    let result = lower
        ? projects.filter(p =>
            p.name.toLowerCase().includes(lower) ||
            (p.description || '').toLowerCase().includes(lower) ||
            (p.projectTags || []).some(l => l.toLowerCase().includes(lower))
        )
        : [...projects];
    if (filters.colors?.length > 0) {
        result = result.filter(p => {
            if (filters.colors.includes('none') && !p.color) return true;
            return filters.colors.includes(p.color);
        });
    }
    if (filters.tags?.length > 0) {
        result = result.filter(p =>
            (p.projectTags || []).some(t => filters.tags.includes(t))
        );
    }
    return result;
}

// ===== 통합 필터 =====
function applyFilters(items, filters) {
    let result = items;

    // 완료 상태
    if (filters.status === 'unchecked') result = result.filter(i => !i.checked);
    if (filters.status === 'checked') result = result.filter(i => i.checked);

    // 색상 (다중 선택, ★ none 버그 수정)
    if (filters.colors?.length > 0) {
        result = result.filter(i => {
            if (filters.colors.includes('none') && !i.color) return true;
            return filters.colors.includes(i.color);
        });
    }

    // 라벨 (다중 선택, OR 조건)
    if (filters.labels?.length > 0) {
        result = result.filter(i =>
            i.labels?.some(l => filters.labels.includes(l))
        );
    }

    // 마감일 (기존)
    if (filters.dueDate === 'has') {
        result = result.filter(i => i.dueDate);
    }
    if (filters.dueDate === 'overdue') {
        const now = new Date();
        result = result.filter(i => {
            if (!i.dueDate || i.checked) return false;
            const due = i.dueDate.toDate ? i.dueDate.toDate() : new Date(i.dueDate);
            return due < now;
        });
    }

    // ★ 마감 6단계 (ProjectPage 동일)
    if (filters.due?.length > 0) {
        const now = new Date();
        const d1 = new Date(now.getTime() + 86400000);
        const d3 = new Date(now.getTime() + 3 * 86400000);
        const d7 = new Date(now.getTime() + 7 * 86400000);
        const d14 = new Date(now.getTime() + 14 * 86400000);
        result = result.filter(i => {
            if (!i.dueDate) return false;
            const due = i.dueDate?.toDate ? i.dueDate.toDate() : new Date(i.dueDate);
            if (isNaN(due.getTime())) return false;
            if (due < now) return filters.due.includes('overdue');
            if (due <= d1) return filters.due.includes('day1');
            if (due <= d3) return filters.due.includes('day3');
            if (due <= d7) return filters.due.includes('day7');
            if (due <= d14) return filters.due.includes('day14');
            return filters.due.includes('later');
        });
    }

    // ★ 반복
    if (filters.repeat === 'yes')
        result = result.filter(i => i.repeatType && i.repeatType !== 'none');

    // ★ 첨부 (이미지+파일)
    if (filters.attachment === 'yes')
        result = result.filter(i => (i.images || []).length > 0 || (i.files || []).length > 0);
    if (filters.attachment === 'image')
        result = result.filter(i => (i.images || []).length > 0);
    if (filters.attachment === 'file')
        result = result.filter(i => (i.files || []).length > 0);
    if (filters.attachment === 'no')
        result = result.filter(i => (i.images || []).length === 0 && (i.files || []).length === 0);

    // ★ 구성원
    if (filters.members?.length > 0)
        result = result.filter(i => filters.members.includes(i.createdBy || ''));

    return result;
}

// ===== 모든 프로젝트 아이템 미리 로드 (검색 탭 진입 시 1회) =====
let _preloading = null;
export async function preloadAllItems(projects) {
    // 이미 로드 중이면 기존 Promise 반환
    if (_preloading) return _preloading;
    const uncached = projects.filter(p => !getCachedItems(p.id) && !searchCacheMap.has(p.id));
    if (uncached.length === 0) return;
    _preloading = (async () => {
        for (const p of uncached) {
            try {
                const q = query(collection(db, 'projects', p.id, 'items'), orderBy('order', 'asc'));
                const snapshot = await getDocs(q);
                const active = [];
                snapshot.forEach(d => {
                    const data = { id: d.id, ...d.data() };
                    if (!data.deleted) active.push(data);
                });
                searchCacheMap.set(p.id, active);
            } catch (e) {
                console.warn(`preload failed for ${p.id}`, e);
            }
        }
        _preloading = null;
    })();
    return _preloading;
}

// ===== 체크리스트 검색 (클라이언트 캐시 전용) =====
export function searchItems(projects, keyword, filters) {
    const lower = (keyword || '').trim().toLowerCase();
    const results = [];

    for (const project of projects) {
        const cached = getCachedItems(project.id);
        const searchCached = !cached ? searchCacheMap.get(project.id) : null;
        const activeItems = cached ? cached.active : searchCached;
        if (!activeItems) continue;

        let items = lower
            ? activeItems.filter(item =>
                item.title.toLowerCase().includes(lower) ||
                (item.content || '').toLowerCase().includes(lower) ||
                (item.labels || []).some(l => l.toLowerCase().includes(lower)) ||
                (item.createdByNickname || '').toLowerCase().includes(lower)
            )
            : [...activeItems];
        items = applyFilters(items, filters);
        items.forEach(m => results.push({
            ...m, projectId: project.id, projectName: project.name
        }));
    }

    return results;
}

// ===== 정렬 =====
export function sortResults(results, sortBy) {
    switch (sortBy) {
        case 'newest':
            return [...results].sort((a, b) =>
                (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        case 'oldest':
            return [...results].sort((a, b) =>
                (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        case 'name':
            return [...results].sort((a, b) =>
                (a.name || a.title || '').localeCompare(b.name || b.title || '', 'ko'));
        case 'dueDate':
            return [...results].sort((a, b) =>
                (a.dueDate?.seconds || Infinity) - (b.dueDate?.seconds || Infinity));
        default:
            return [...results];
    }
}

// ===== 하이라이팅 =====
export function highlightText(text, keyword) {
    if (!keyword || !text) return [text || ''];
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return text.split(regex);
}

// ===== 최근 검색어 =====
const RECENT_KEY = 'recentSearches';
const MAX_RECENT = 5;

export function getRecentSearches() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; }
    catch { return []; }
}

export function addRecentSearch(keyword) {
    const trimmed = keyword.trim();
    if (!trimmed || trimmed.length < 2) return;
    const list = getRecentSearches().filter(k => k !== trimmed);
    list.unshift(trimmed);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

export function clearRecentSearches() {
    localStorage.removeItem(RECENT_KEY);
}
