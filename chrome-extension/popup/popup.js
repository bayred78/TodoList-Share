// ===== Firebase 초기화 =====
const firebaseConfig = {
    apiKey: "AIzaSyBbpprm6wI3N23HzAQXDo8gfIMPzgHm2Ic",
    authDomain: "todolist-share.firebaseapp.com",
    databaseURL: "https://todolist-share-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "todolist-share",
    storageBucket: "todolist-share.firebasestorage.app",
    messagingSenderId: "865182648003",
    appId: "1:865182648003:web:b8def5d731e1ea928bc476",
    measurementId: "G-EP2Z17K5N5",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ===== 상태 관리 =====
let currentUser = null;
let currentProfile = null;
let currentProjectId = null;
let currentProject = null;
let currentFilter = 'all';
let currentItemType = 'checklist';
let unsubProjects = null;
let unsubInvitations = null;
let unsubTodos = null;
let calendarTargetItemId = null;
let calendarTargetItem = null;

// ===== DOM 요소 =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// 화면
const screens = {
    loading: $('#loading-screen'),
    login: $('#login-screen'),
    nickname: $('#nickname-screen'),
    main: $('#main-screen'),
    project: $('#project-screen'),
    settings: $('#settings-screen'),
};

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[name].classList.remove('hidden');
}

// ===== 토스트 =====
function showToast(message, type = 'info') {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// ===== 모달 =====
function openModal(id) { $(`#${id}`).classList.remove('hidden'); }
function closeModal(id) { $(`#${id}`).classList.add('hidden'); }

// 모달 닫기 이벤트
document.querySelectorAll('.modal-close, .modal-cancel, .modal-backdrop').forEach(el => {
    el.addEventListener('click', () => {
        el.closest('.modal').classList.add('hidden');
    });
});

// ===== 인증 =====
$('#btn-google-login').addEventListener('click', async () => {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
    } catch (e) {
        showToast('로그인 실패: ' + e.message, 'error');
    }
});

// 닉네임 설정
$('#btn-set-nickname').addEventListener('click', async () => {
    const nickname = $('#input-nickname').value.trim();
    if (!nickname || nickname.length < 2 || nickname.length > 20) {
        showToast('닉네임은 2~20자로 입력해주세요.', 'warning');
        return;
    }

    try {
        // 닉네임 중복 확인
        const nicknameDoc = await db.collection('nicknames').doc(nickname).get();
        if (nicknameDoc.exists) {
            showToast('이미 사용 중인 닉네임입니다.', 'error');
            return;
        }

        const batch = db.batch();
        batch.set(db.collection('users').doc(currentUser.uid), {
            uid: currentUser.uid,
            email: currentUser.email,
            nickname: nickname,
            nicknameChangedAt: firebase.firestore.FieldValue.serverTimestamp(),
            googleCalendarId: '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        batch.set(db.collection('nicknames').doc(nickname), {
            uid: currentUser.uid,
        });
        await batch.commit();

        showToast('환영합니다!', 'success');
        loadProfile();
    } catch (e) {
        showToast('닉네임 설정 실패: ' + e.message, 'error');
    }
});

// 인증 상태 감시
auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (!user) {
        showScreen('login');
        cleanup();
        return;
    }
    loadProfile();
});

async function loadProfile() {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (!doc.exists) {
        showScreen('nickname');
        return;
    }
    currentProfile = doc.data();
    showScreen('main');
    loadProjects();
    loadInvitations();
}

// ===== 프로젝트 =====
function loadProjects() {
    if (unsubProjects) unsubProjects();
    unsubProjects = db.collection('projects')
        .where(`members.${currentUser.uid}.joined`, '==', true)
        .onSnapshot(snap => {
            const list = $('#project-list');
            if (snap.empty) {
                list.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>프로젝트가 없습니다</p></div>';
                return;
            }

            list.innerHTML = '';
            snap.forEach(doc => {
                const p = doc.data();
                const memberCount = Object.keys(p.members || {}).filter(k => p.members[k].joined).length;
                const myRole = p.members[currentUser.uid]?.role || 'read';

                const card = document.createElement('div');
                card.className = 'project-card';
                card.innerHTML = `
          <div class="project-card-header">
            <span class="project-card-name">${escapeHtml(p.name)}</span>
            <span class="badge badge-primary">${getRoleName(myRole)}</span>
          </div>
          ${p.description ? `<p class="project-card-desc">${escapeHtml(p.description)}</p>` : ''}
          <div class="project-card-meta">
            <span>👥 ${memberCount}명</span>
            ${memberCount >= 3 && !p.subscriptionActive ? '<span class="badge badge-danger">읽기전용</span>' : ''}
          </div>
        `;
                card.addEventListener('click', () => openProject(doc.id, p));
                list.appendChild(card);
            });
        });
}

function getRoleName(role) {
    const names = { admin: '관리자', editor: '편집자', viewer: '독자', read: '읽기', write: '쓰기', readwrite: '편집자' };
    return names[role] || role;
}

// ===== 초대 =====
function loadInvitations() {
    if (unsubInvitations) unsubInvitations();
    unsubInvitations = db.collection('invitations')
        .where('inviteeId', '==', currentUser.uid)
        .where('status', '==', 'pending')
        .onSnapshot(snap => {
            const list = $('#invitation-list');
            const badge = $('#invite-count');

            if (snap.empty) {
                badge.classList.add('hidden');
                list.innerHTML = '<div class="empty-state"><div class="empty-icon">✉️</div><p>받은 초대가 없습니다</p></div>';
                return;
            }

            badge.textContent = snap.size;
            badge.classList.remove('hidden');
            list.innerHTML = '';

            snap.forEach(doc => {
                const inv = doc.data();
                const card = document.createElement('div');
                card.className = 'invitation-card';
                card.innerHTML = `
          <div class="invitation-info">
            <div class="invitation-project">${escapeHtml(inv.projectName)}</div>
            <div class="invitation-from">${escapeHtml(inv.inviterNickname)}님의 초대</div>
          </div>
          <div class="invitation-actions">
            <button class="btn btn-sm btn-primary btn-accept" data-id="${doc.id}">수락</button>
            <button class="btn btn-sm btn-secondary btn-reject" data-id="${doc.id}">거절</button>
          </div>
        `;

                card.querySelector('.btn-accept').addEventListener('click', (e) => {
                    e.stopPropagation();
                    acceptInvitation(doc.id, inv);
                });
                card.querySelector('.btn-reject').addEventListener('click', (e) => {
                    e.stopPropagation();
                    rejectInvitation(doc.id);
                });

                list.appendChild(card);
            });
        });
}

async function acceptInvitation(invId, inv) {
    try {
        const batch = db.batch();
        batch.update(db.collection('invitations').doc(invId), { status: 'accepted' });
        batch.update(db.collection('projects').doc(inv.projectId), {
            [`members.${currentUser.uid}`]: {
                uid: currentUser.uid,
                nickname: currentProfile.nickname,
                role: inv.role || 'editor',
                joined: true,
                joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
            },
        });
        await batch.commit();
        showToast('초대를 수락했습니다.', 'success');
    } catch (e) {
        showToast('수락 실패: ' + e.message, 'error');
    }
}

async function rejectInvitation(invId) {
    try {
        await db.collection('invitations').doc(invId).update({ status: 'rejected' });
        showToast('초대를 거절했습니다.', 'info');
    } catch (e) {
        showToast('거절 실패: ' + e.message, 'error');
    }
}

// ===== 프로젝트 상세 =====
function openProject(id, project) {
    currentProjectId = id;
    currentProject = project;

    showScreen('project');
    $('#project-title').textContent = project.name;

    const myRole = project.members[currentUser.uid]?.role || 'read';
    const isAdmin = myRole === 'admin';
    const canWrite = ['write', 'readwrite', 'editor', 'admin'].includes(myRole);
    const memberCount = Object.keys(project.members || {}).filter(k => project.members[k].joined).length;
    const readOnly = memberCount >= 3 && !project.subscriptionActive;

    // 버튼 표시
    if (isAdmin) $('#btn-invite-member').classList.remove('hidden');
    else $('#btn-invite-member').classList.add('hidden');

    if (canWrite && !readOnly) $('#btn-add-item').classList.remove('hidden');
    else $('#btn-add-item').classList.add('hidden');

    if (readOnly) $('#readonly-banner').classList.remove('hidden');
    else $('#readonly-banner').classList.add('hidden');

    // 프로젝트 설정 버튼 이벤트
    const settingsBtn = $('#btn-project-settings');
    settingsBtn.onclick = () => {
        const myCalId = project.members[currentUser.uid]?.googleCalendarId || '';
        $('#input-project-calendar-id').value = myCalId;
        $('#calendar-help-panel').classList.add('hidden');
        openModal('modal-project-settings');
    };

    loadTodos();
}

function loadTodos() {
    if (unsubTodos) unsubTodos();
    let query = db.collection('projects').doc(currentProjectId).collection('items')
        .orderBy('createdAt', 'desc');

    if (currentFilter === 'memo') query = query.where('type', '==', 'memo');
    else if (currentFilter === 'checklist') query = query.where('type', '==', 'checklist');

    unsubTodos = query.onSnapshot(snap => {
        const list = $('#todo-list');
        if (snap.empty) {
            list.innerHTML = '<div class="empty-state"><div class="empty-icon">📌</div><p>아이템이 없습니다</p></div>';
            return;
        }

        list.innerHTML = '';
        snap.forEach(doc => {
            const item = doc.data();
            const el = createTodoElement(doc.id, item);
            list.appendChild(el);
        });
    });
}

function createTodoElement(id, item) {
    const el = document.createElement('div');
    el.className = `todo-item ${item.checked ? 'checked' : ''}`;

    const isChecklist = item.type === 'checklist';
    const myRole = currentProject?.members?.[currentUser.uid]?.role || 'read';
    const canWrite = ['write', 'readwrite', 'editor', 'admin'].includes(myRole);
    const memberCount = Object.keys(currentProject?.members || {}).filter(k => currentProject.members[k].joined).length;
    const readOnly = memberCount >= 3 && !currentProject?.subscriptionActive;

    el.innerHTML = `
    ${isChecklist ? `<button class="todo-checkbox ${item.checked ? 'checked' : ''}" data-id="${id}">${item.checked ? '✓' : ''}</button>` : '<span class="todo-type-icon">📝</span>'}
    <div class="todo-content">
      <div class="todo-title ${item.checked ? 'line-through' : ''}">${escapeHtml(item.title)}</div>
      ${item.content ? `<div class="todo-desc">${escapeHtml(item.content)}</div>` : ''}
    </div>
    <div class="todo-actions">
      ${isChecklist ? `<button class="todo-btn ${item.calendarEventId ? 'synced' : ''}" title="${item.calendarEventId ? '캘린더 제거' : '캘린더 추가'}" data-calendar="${id}">📅</button>` : ''}
      ${canWrite && !readOnly ? `<button class="todo-btn" data-delete="${id}" title="삭제">🗑</button>` : ''}
    </div>
  `;

    // 체크 토글
    const checkbox = el.querySelector('.todo-checkbox');
    if (checkbox && canWrite && !readOnly) {
        checkbox.addEventListener('click', () => {
            db.collection('projects').doc(currentProjectId).collection('items').doc(id)
                .update({ checked: !item.checked });
        });
    }

    // 삭제
    const deleteBtn = el.querySelector('[data-delete]');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (!confirm('삭제하시겠습니까?')) return;
            try {
                await db.collection('projects').doc(currentProjectId).collection('items').doc(id).delete();
                showToast('삭제되었습니다.', 'success');
            } catch (e) { showToast('삭제 실패', 'error'); }
        });
    }

    // 캘린더 (프로젝트별 캘린더 ID 사용, 날짜 선택 모달)
    const calBtn = el.querySelector('[data-calendar]');
    if (calBtn) {
        calBtn.addEventListener('click', async () => {
            const myCalId = currentProject?.members?.[currentUser.uid]?.googleCalendarId;
            if (!myCalId) {
                showToast('이 프로젝트의 캘린더 ID를 먼저 설정해주세요. (⚙️ → 캘린더 연동)', 'warning');
                return;
            }
            // 이미 등록된 경우 → 바로 삭제
            if (item.calendarEventId) {
                await removeFromCalendar(id, item);
                return;
            }
            // 미등록 → 날짜 선택 모달 열기
            calendarTargetItemId = id;
            calendarTargetItem = item;
            $('#date-picker-item-title').textContent = item.title;
            $('#input-calendar-date').value = new Date().toISOString().split('T')[0];
            openModal('modal-date-picker');
        });
    }

    return el;
}

// ===== 구글 캘린더 (Chrome Extension API 사용) =====
async function getAuthToken() {
    return new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            resolve(token);
        });
    });
}

async function addToCalendar(itemId, item, date) {
    try {
        const token = await getAuthToken();
        if (!token) { showToast('인증 실패', 'error'); return; }

        const myCalId = currentProject?.members?.[currentUser.uid]?.googleCalendarId;
        if (!myCalId) { showToast('캘린더 ID가 설정되지 않았습니다.', 'error'); return; }

        const eventDate = date || new Date().toISOString().split('T')[0];
        const event = {
            summary: item.title,
            description: item.content || '',
            start: { date: eventDate },
            end: { date: eventDate },
        };

        const res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(myCalId)}/events`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(event),
            }
        );

        if (!res.ok) throw new Error('캘린더 API 오류');
        const data = await res.json();

        await db.collection('projects').doc(currentProjectId).collection('items').doc(itemId)
            .update({ calendarEventId: data.id });

        showToast(`${eventDate}에 캘린더 등록 완료!`, 'success');
    } catch (e) {
        showToast('캘린더 추가 실패: ' + e.message, 'error');
    }
}

async function removeFromCalendar(itemId, item) {
    try {
        const token = await getAuthToken();
        if (!token) { showToast('인증 실패', 'error'); return; }

        const myCalId = currentProject?.members?.[currentUser.uid]?.googleCalendarId;
        if (!myCalId) { showToast('캘린더 ID가 설정되지 않았습니다.', 'error'); return; }

        await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(myCalId)}/events/${item.calendarEventId}`,
            {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            }
        );

        await db.collection('projects').doc(currentProjectId).collection('items').doc(itemId)
            .update({ calendarEventId: firebase.firestore.FieldValue.delete() });

        showToast('캘린더에서 제거되었습니다.', 'success');
    } catch (e) {
        showToast('캘린더 제거 실패: ' + e.message, 'error');
    }
}

// ===== 프로젝트 생성 =====
$('#btn-create-project').addEventListener('click', () => openModal('modal-create-project'));
$('#btn-confirm-create').addEventListener('click', async () => {
    const name = $('#input-project-name').value.trim();
    if (!name) { showToast('프로젝트 이름을 입력해주세요.', 'warning'); return; }

    try {
        await db.collection('projects').add({
            name: name,
            description: $('#input-project-desc').value.trim(),
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            members: {
                [currentUser.uid]: {
                    uid: currentUser.uid,
                    nickname: currentProfile.nickname,
                    role: 'admin',
                    joined: true,
                    joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
                }
            },
            memberCount: 1,
            subscriptionActive: false,
        });

        closeModal('modal-create-project');
        $('#input-project-name').value = '';
        $('#input-project-desc').value = '';
        showToast('프로젝트가 생성되었습니다.', 'success');
    } catch (e) {
        showToast('생성 실패: ' + e.message, 'error');
    }
});

// ===== 아이템 추가 =====
$('#btn-add-item').addEventListener('click', () => openModal('modal-add-item'));

// 아이템 유형 탭
$('#modal-add-item .tab-bar').addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-item')) {
        $('#modal-add-item .tab-bar .tab-item.active').classList.remove('active');
        e.target.classList.add('active');
        currentItemType = e.target.dataset.type;
    }
});

$('#btn-confirm-add-item').addEventListener('click', async () => {
    const title = $('#input-item-title').value.trim();
    if (!title) { showToast('제목을 입력해주세요.', 'warning'); return; }

    try {
        await db.collection('projects').doc(currentProjectId).collection('items').add({
            title: title,
            content: $('#input-item-content').value.trim(),
            type: currentItemType,
            checked: false,
            createdBy: currentUser.uid,
            createdByNickname: currentProfile.nickname,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

        closeModal('modal-add-item');
        $('#input-item-title').value = '';
        $('#input-item-content').value = '';
        showToast('아이템이 추가되었습니다.', 'success');
    } catch (e) {
        showToast('추가 실패: ' + e.message, 'error');
    }
});

// ===== 멤버 초대 =====
$('#btn-invite-member').addEventListener('click', () => openModal('modal-invite'));
$('#btn-confirm-invite').addEventListener('click', async () => {
    const nickname = $('#input-invite-nickname').value.trim();
    const role = $('#select-invite-role').value;
    if (!nickname) { showToast('닉네임을 입력해주세요.', 'warning'); return; }

    try {
        // 닉네임으로 사용자 찾기
        const nicknameDoc = await db.collection('nicknames').doc(nickname).get();
        if (!nicknameDoc.exists) {
            showToast('존재하지 않는 닉네임입니다.', 'error');
            return;
        }
        const inviteeId = nicknameDoc.data().uid;
        if (inviteeId === currentUser.uid) {
            showToast('자기 자신은 초대할 수 없습니다.', 'warning');
            return;
        }

        // 이미 멤버인지 확인
        if (currentProject.members[inviteeId]?.joined) {
            showToast('이미 참여 중인 사용자입니다.', 'warning');
            return;
        }

        await db.collection('invitations').add({
            projectId: currentProjectId,
            projectName: currentProject.name,
            inviterId: currentUser.uid,
            inviterNickname: currentProfile.nickname,
            inviteeId: inviteeId,
            inviteeNickname: nickname,
            role: role,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

        closeModal('modal-invite');
        $('#input-invite-nickname').value = '';
        showToast(`${nickname}님을 초대했습니다.`, 'success');
    } catch (e) {
        showToast('초대 실패: ' + e.message, 'error');
    }
});

// ===== 네비게이션 =====
$('#btn-back-to-main').addEventListener('click', () => {
    if (unsubTodos) { unsubTodos(); unsubTodos = null; }
    currentProjectId = null;
    currentProject = null;
    showScreen('main');
});

$('#btn-settings').addEventListener('click', () => {
    showScreen('settings');
    loadSettings();
});

$('#btn-back-from-settings').addEventListener('click', () => showScreen('main'));

$('#btn-refresh').addEventListener('click', () => {
    loadProjects();
    loadInvitations();
    showToast('새로고침 완료', 'success');
});

// ===== 탭 전환 =====
$('#main-screen .tab-bar').addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-item')) {
        $('#main-screen .tab-bar .tab-item.active')?.classList.remove('active');
        e.target.classList.add('active');
        const tab = e.target.dataset.tab;
        if (tab === 'projects') {
            $('#project-list').classList.remove('hidden');
            $('#invitation-list').classList.add('hidden');
        } else {
            $('#project-list').classList.add('hidden');
            $('#invitation-list').classList.remove('hidden');
        }
    }
});

// 필터 탭
$('#project-screen .tab-bar').addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-item')) {
        $('#project-screen .tab-bar .tab-item.active')?.classList.remove('active');
        e.target.classList.add('active');
        currentFilter = e.target.dataset.filter;
        loadTodos();
    }
});

// ===== 설정 =====
function loadSettings() {
    if (!currentProfile) return;
    $('#profile-avatar').textContent = currentProfile.nickname?.charAt(0)?.toUpperCase() || '?';
    $('#profile-nickname').textContent = currentProfile.nickname || '?';
    $('#profile-email').textContent = currentProfile.email || '-';
    $('#current-nickname').textContent = currentProfile.nickname || '-';

    // 닉네임 변경 가능 여부
    const btn = $('#btn-change-nickname');
    if (currentProfile.nicknameChangedAt) {
        const lastChanged = currentProfile.nicknameChangedAt.toDate ? currentProfile.nicknameChangedAt.toDate() : new Date(currentProfile.nicknameChangedAt);
        const days = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
        if (days < 7) {
            btn.textContent = `${Math.ceil(7 - days)}일 후 변경 가능`;
            btn.disabled = true;
        } else {
            btn.textContent = '변경';
            btn.disabled = false;
        }
    }
}

$('#btn-change-nickname').addEventListener('click', async () => {
    const newNick = prompt('새 닉네임을 입력하세요 (2~20자):');
    if (!newNick || newNick.trim().length < 2 || newNick.trim().length > 20) return;

    try {
        const exists = await db.collection('nicknames').doc(newNick.trim()).get();
        if (exists.exists) { showToast('이미 사용 중인 닉네임입니다.', 'error'); return; }

        const batch = db.batch();
        batch.delete(db.collection('nicknames').doc(currentProfile.nickname));
        batch.set(db.collection('nicknames').doc(newNick.trim()), { uid: currentUser.uid });
        batch.update(db.collection('users').doc(currentUser.uid), {
            nickname: newNick.trim(),
            nicknameChangedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        await batch.commit();

        currentProfile.nickname = newNick.trim();
        loadSettings();
        showToast('닉네임이 변경되었습니다.', 'success');
    } catch (e) {
        showToast('변경 실패: ' + e.message, 'error');
    }
});

$('#btn-save-calendar').addEventListener('click', async () => {
    try {
        const calId = $('#input-calendar-id').value.trim();
        await db.collection('users').doc(currentUser.uid).update({ googleCalendarId: calId });
        currentProfile.googleCalendarId = calId;
        showToast('캘린더 ID가 저장되었습니다.', 'success');
    } catch (e) {
        showToast('저장 실패: ' + e.message, 'error');
    }
});

// 프로젝트별 캘린더 저장
$('#btn-save-project-calendar').addEventListener('click', async () => {
    if (!currentProjectId) return;
    try {
        const calId = $('#input-project-calendar-id').value.trim();
        await db.collection('projects').doc(currentProjectId).update({
            [`members.${currentUser.uid}.googleCalendarId`]: calId
        });
        if (currentProject && currentProject.members && currentProject.members[currentUser.uid]) {
            currentProject.members[currentUser.uid].googleCalendarId = calId;
        }
        showToast('이 프로젝트의 캘린더 ID가 저장되었습니다.', 'success');
        closeModal('modal-project-settings');
    } catch (e) {
        showToast('저장 실패: ' + e.message, 'error');
    }
});

// 캘린더 날짜 선택 확인
$('#btn-confirm-calendar-date').addEventListener('click', async () => {
    if (!calendarTargetItemId || !calendarTargetItem) return;
    const selectedDate = $('#input-calendar-date').value;
    if (!selectedDate) {
        showToast('날짜를 선택해주세요.', 'warning');
        return;
    }
    closeModal('modal-date-picker');
    await addToCalendar(calendarTargetItemId, calendarTargetItem, selectedDate);
    calendarTargetItemId = null;
    calendarTargetItem = null;
});

// 캘린더 도움말 토글
$('#btn-toggle-calendar-help').addEventListener('click', () => {
    const panel = $('#calendar-help-panel');
    panel.classList.toggle('hidden');
    $('#btn-toggle-calendar-help').textContent = panel.classList.contains('hidden') ? '📌 도움말' : '도움말 접기';
});

$('#btn-logout').addEventListener('click', async () => {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    cleanup();
    await auth.signOut();
});

// ===== 유틸리티 =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function cleanup() {
    if (unsubProjects) { unsubProjects(); unsubProjects = null; }
    if (unsubInvitations) { unsubInvitations(); unsubInvitations = null; }
    if (unsubTodos) { unsubTodos(); unsubTodos = null; }
    currentProfile = null;
    currentProjectId = null;
    currentProject = null;
}
