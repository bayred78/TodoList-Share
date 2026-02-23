import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getCalendarList, listCalendarEvents, hasCalendarToken, getOAuthAccessToken } from '../services/calendarService';
import './CalendarView.css';

const STORAGE_KEY_PREFIX = 'calendarFilter_';

export default function CalendarView({ calendarId, onToast, refreshKey, showCalendarFilter, onFilterClose }) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState(null);
    const [error, setError] = useState(null);

    // 다중 캘린더 관련
    const [calendarList, setCalendarList] = useState([]);
    const [selectedCalendars, setSelectedCalendars] = useState(null); // null = 아직 로드 안됨
    const [loadingList, setLoadingList] = useState(false);

    // 인증 상태
    const [authenticated, setAuthenticated] = useState(hasCalendarToken());
    const [authenticating, setAuthenticating] = useState(false);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // 달력 그리드 계산
    const calendarDays = useMemo(() => {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDay = firstDay.getDay();
        const daysInMonth = lastDay.getDate();

        const days = [];

        const prevMonthLast = new Date(year, month, 0).getDate();
        for (let i = startDay - 1; i >= 0; i--) {
            days.push({ day: prevMonthLast - i, isCurrentMonth: false, date: null });
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            days.push({ day: d, isCurrentMonth: true, date: dateStr });
        }

        const remaining = 42 - days.length;
        for (let i = 1; i <= remaining; i++) {
            days.push({ day: i, isCurrentMonth: false, date: null });
        }

        return days;
    }, [year, month]);

    // 수동 인증 버튼 클릭
    const handleAuthenticate = async () => {
        setAuthenticating(true);
        setError(null);
        try {
            await getOAuthAccessToken();
            setAuthenticated(true);
        } catch (err) {
            setError(err.message);
            if (onToast) onToast(err.message, 'error');
        } finally {
            setAuthenticating(false);
        }
    };

    // 캘린더 목록 로드 (인증 완료 후에만)
    const loadCalendarList = useCallback(async () => {
        if (!authenticated) return;
        setLoadingList(true);
        try {
            const list = await getCalendarList();
            setCalendarList(list);

            // localStorage에서 선택 상태 복원
            const storageKey = STORAGE_KEY_PREFIX + (calendarId || 'default');
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    const validIds = new Set(list.map(c => c.id));
                    const filtered = parsed.filter(id => validIds.has(id));
                    setSelectedCalendars(filtered.length > 0 ? filtered : list.map(c => c.id));
                } catch {
                    setSelectedCalendars(list.map(c => c.id));
                }
            } else {
                setSelectedCalendars(list.map(c => c.id));
            }
        } catch (err) {
            console.error('캘린더 목록 로드 실패:', err);
            if (calendarId) {
                setCalendarList([{ id: calendarId, summary: '프로젝트 캘린더', backgroundColor: '#4285f4' }]);
                setSelectedCalendars([calendarId]);
            }
        } finally {
            setLoadingList(false);
        }
    }, [calendarId, authenticated]);

    useEffect(() => {
        loadCalendarList();
    }, [loadCalendarList]);

    // 선택 상태 localStorage 저장
    useEffect(() => {
        if (selectedCalendars && calendarId) {
            const storageKey = STORAGE_KEY_PREFIX + calendarId;
            localStorage.setItem(storageKey, JSON.stringify(selectedCalendars));
        }
    }, [selectedCalendars, calendarId]);

    // 이벤트 로딩 (선택된 캘린더들에서)
    const loadEvents = useCallback(async () => {
        if (!authenticated || !selectedCalendars || selectedCalendars.length === 0) {
            setEvents([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const timeMin = new Date(year, month, 1);
            const timeMax = new Date(year, month + 1, 0, 23, 59, 59);

            const results = await Promise.allSettled(
                selectedCalendars.map(async (cId) => {
                    const cal = calendarList.find(c => c.id === cId);
                    const eventList = await listCalendarEvents(cId, timeMin, timeMax);
                    return eventList.map(evt => ({
                        ...evt,
                        calendarId: cId,
                        calendarName: cal?.summary || cId,
                        calendarColor: cal?.backgroundColor || '#4285f4',
                    }));
                })
            );

            const allEvents = results
                .filter(r => r.status === 'fulfilled')
                .flatMap(r => r.value);

            setEvents(allEvents);
        } catch (err) {
            console.error('캘린더 이벤트 로드 실패:', err);
            setError(err.message);
            if (onToast) onToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [authenticated, selectedCalendars, calendarList, year, month, onToast, refreshKey]);

    useEffect(() => {
        loadEvents();
    }, [loadEvents]);

    // 날짜별 이벤트 맵
    const eventsByDate = useMemo(() => {
        const map = {};
        events.forEach(evt => {
            if (evt.start) {
                const key = evt.start;
                if (!map[key]) map[key] = [];
                map[key].push(evt);
            }
        });
        return map;
    }, [events]);

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const goToday = () => setCurrentDate(new Date());

    const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

    const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

    const toggleCalendarSelection = (calId) => {
        setSelectedCalendars(prev => {
            if (prev.includes(calId)) {
                if (prev.length <= 1) return prev;
                return prev.filter(id => id !== calId);
            } else {
                return [...prev, calId];
            }
        });
    };

    const selectAllCalendars = () => {
        setSelectedCalendars(calendarList.map(c => c.id));
    };

    // 인증 안 된 상태이면 인증 UI 표시
    if (!authenticated) {
        return (
            <div className="cal-view">
                <div className="cal-auth-required">
                    <div className="cal-auth-icon">🔐</div>
                    <div className="cal-auth-title">Google 캘린더 인증 필요</div>
                    <div className="cal-auth-desc">
                        캘린더를 보려면 Google 계정으로 캘린더 접근을 허용해야 합니다.
                    </div>
                    <button
                        className="cal-auth-btn"
                        onClick={handleAuthenticate}
                        disabled={authenticating}
                    >
                        {authenticating ? '인증 중...' : '📅 Google 캘린더 인증'}
                    </button>
                    {error && <div className="cal-auth-error">⚠️ {error}</div>}
                </div>
            </div>
        );
    }

    return (
        <div className="cal-view">
            {/* 캘린더 필터 패널 */}
            {showCalendarFilter && (
                <div className="cal-filter-panel">
                    <div className="cal-filter-header">
                        <span className="cal-filter-title">📅 내 캘린더</span>
                        <div className="cal-filter-actions">
                            <button className="cal-filter-all-btn" onClick={selectAllCalendars}>전체선택</button>
                            <button className="cal-filter-close" onClick={onFilterClose}>✕</button>
                        </div>
                    </div>
                    {loadingList ? (
                        <div className="cal-filter-loading">로딩 중...</div>
                    ) : (
                        <div className="cal-filter-list">
                            {calendarList.map(cal => (
                                <label key={cal.id} className="cal-filter-item">
                                    <input
                                        type="checkbox"
                                        checked={selectedCalendars?.includes(cal.id) || false}
                                        onChange={() => toggleCalendarSelection(cal.id)}
                                    />
                                    <span
                                        className="cal-filter-color"
                                        style={{ backgroundColor: cal.backgroundColor || '#4285f4' }}
                                    />
                                    <span className="cal-filter-name">{cal.summary || cal.id}</span>
                                </label>
                            ))}
                            {calendarList.length === 0 && (
                                <div className="cal-filter-empty">캘린더가 없습니다</div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* 헤더 */}
            <div className="cal-header">
                <button className="cal-nav-btn" onClick={prevMonth}>◀</button>
                <div className="cal-title-area">
                    <span className="cal-title">{year}년 {month + 1}월</span>
                    <button className="cal-today-btn" onClick={goToday}>오늘</button>
                </div>
                <button className="cal-nav-btn" onClick={nextMonth}>▶</button>
            </div>

            {/* 에러 */}
            {error && (
                <div className="cal-error">
                    ⚠️ {error}
                    <button onClick={loadEvents} className="cal-retry-btn">재시도</button>
                </div>
            )}

            {/* 요일 헤더 */}
            <div className="cal-weekdays">
                {WEEKDAYS.map((w, i) => (
                    <div key={w} className={`cal-weekday ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>
                        {w}
                    </div>
                ))}
            </div>

            {/* 달력 그리드 */}
            <div className="cal-grid">
                {calendarDays.map((cell, idx) => {
                    const dayEvents = cell.date ? (eventsByDate[cell.date] || []) : [];
                    const isToday = cell.date === todayStr;
                    const isSelected = cell.date === selectedDate;
                    const dayOfWeek = idx % 7;

                    return (
                        <div
                            key={idx}
                            className={`cal-cell ${!cell.isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${dayOfWeek === 0 ? 'sun' : dayOfWeek === 6 ? 'sat' : ''}`}
                            onClick={() => cell.isCurrentMonth && setSelectedDate(cell.date === selectedDate ? null : cell.date)}
                        >
                            <span className="cal-day-num">{cell.day}</span>
                            {dayEvents.length > 0 && (
                                <div className="cal-event-dots">
                                    {dayEvents.slice(0, 3).map((evt, i) => (
                                        <span
                                            key={i}
                                            className="cal-event-dot"
                                            style={{ backgroundColor: evt.calendarColor || '#4285f4' }}
                                            title={evt.title}
                                        />
                                    ))}
                                    {dayEvents.length > 3 && <span className="cal-event-more">+{dayEvents.length - 3}</span>}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 로딩 오버레이 */}
            {loading && <div className="cal-loading">로딩 중...</div>}

            {/* 선택된 날짜 이벤트 목록 */}
            {selectedDate && (
                <div className="cal-event-list">
                    <div className="cal-event-list-header">
                        📅 {selectedDate}
                        <button className="cal-close-btn" onClick={() => setSelectedDate(null)}>✕</button>
                    </div>
                    {selectedEvents.length === 0 ? (
                        <div className="cal-no-events">이벤트가 없습니다</div>
                    ) : (
                        selectedEvents.map(evt => (
                            <div key={`${evt.calendarId}-${evt.id}`} className="cal-event-item">
                                <span
                                    className="cal-event-color-bar"
                                    style={{ backgroundColor: evt.calendarColor || '#4285f4' }}
                                />
                                <div className="cal-event-content">
                                    <div className="cal-event-title">{evt.title}</div>
                                    <div className="cal-event-calendar-name">{evt.calendarName}</div>
                                    {evt.description && (
                                        <div className="cal-event-desc">{evt.description}</div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
