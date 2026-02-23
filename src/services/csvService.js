import { LABEL_COLORS, normalizeColorId } from '../constants/colors';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// 중요도 id → 한글 이름
const COLOR_NAME_MAP = Object.fromEntries(
    LABEL_COLORS.map(c => [c.id, c.name])
);

// Timestamp/Date 안전 변환
function formatDate(ts) {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

// CSV 셀 이스케이프 + injection 방어
function escapeCsv(value) {
    let str = String(value ?? '');
    // CSV injection 방어: =, +, -, @ 시작 시 작은따옴표 추가
    if (/^[=+\-@]/.test(str)) {
        str = "'" + str;
    }
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

// 파일명 안전 처리
function sanitizeFileName(name) {
    return (name || '체크리스트').replace(/[\\/:*?"<>|]/g, '_').trim() || '체크리스트';
}

// 아이템 → CSV 문자열
export function generateCsv(items) {
    const header = ['제목', '내용', '상태', '중요도', '마감일', '라벨', '반복', '생성자', '생성일'];
    const rows = items
        .filter(i => i.type === 'checklist')
        .map(item => [
            escapeCsv(item.title),
            escapeCsv(item.content),
            item.checked ? '완료' : '미완료',
            escapeCsv(COLOR_NAME_MAP[normalizeColorId(item.color)] || ''),
            escapeCsv(formatDate(item.dueDate)),
            escapeCsv((item.labels || []).join(', ')),
            escapeCsv(item.repeatType && item.repeatType !== 'none' ? item.repeatType : ''),
            escapeCsv(item.createdByNickname || ''),
            escapeCsv(formatDate(item.createdAt)),
        ]);
    return '\uFEFF' + [header.join(','), ...rows.map(r => r.join(','))].join('\n');
}

// CSV 파일 다운로드
export async function downloadCsv(csvContent, fileName) {
    // 네이티브 앱(Capacitor): Filesystem에 저장 → Share로 공유 시트
    if (Capacitor.isNativePlatform()) {
        try {
            // 1) 캐시 디렉토리에 파일 저장 (권한 불필요)
            const writeResult = await Filesystem.writeFile({
                path: fileName,
                data: csvContent,
                directory: Directory.Cache,
                encoding: Encoding.UTF8,
            });

            // 2) 저장된 파일 URI로 네이티브 공유 시트 열기
            const fileUri = writeResult.uri;
            await Share.share({
                title: fileName,
                url: fileUri,
            });
            return;
        } catch (err) {
            // 사용자가 공유 취소 시 무시
            if (err?.message?.includes('cancel') || err?.message?.includes('dismiss')) return;
            console.error('Native CSV export failed:', err);
            // fallback: Blob 방식 시도 (웹뷰에서는 안 될 수 있음)
        }
    }

    // 웹 브라우저: 기존 Blob URL 방식
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// 통합: 아이템 → CSV 다운로드
export async function exportItemsToCsv(items, projectName) {
    const csv = generateCsv(items);
    const date = new Date().toISOString().split('T')[0];
    await downloadCsv(csv, `${sanitizeFileName(projectName)}_${date}.csv`);
}

// ── CSV 가져오기 ──

// 중요도 한글이름 → id 역매핑
const NAME_COLOR_MAP = Object.fromEntries(
    LABEL_COLORS.map(c => [c.name, c.id])
);

// CSV injection 방어 접두사 제거
function unescapeCsv(str) {
    if (!str) return '';
    return str.trim().replace(/^'/, '');
}

// 날짜 문자열 파싱 (Safari 호환: 공백→T 변환)
function parseDateString(str) {
    if (!str) return null;
    // "2024-01-15 14:30" → "2024-01-15T14:30" (Safari는 공백 구분 불가)
    const normalized = str.replace(' ', 'T');
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
}

// RFC 4180 호환 CSV 행 파싱 (따옴표/줄바꿈 처리)
function parseRow(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
                current += '"'; i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current); current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current);
    return result;
}

// 따옴표 안의 줄바꿈을 존중하는 CSV 행 분리
function splitCsvRows(text) {
    const rows = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"' && text[i + 1] === '"') {
                current += '""'; i++;
            } else if (ch === '"') {
                inQuotes = false;
                current += ch;
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
                current += ch;
            } else if (ch === '\n') {
                rows.push(current);
                current = '';
            } else if (ch === '\r') {
                // \r\n → skip \r
            } else {
                current += ch;
            }
        }
    }
    if (current.trim()) rows.push(current);
    return rows;
}

// CSV 텍스트 → 아이템 배열 파싱
export function parseCsv(csvText) {
    const cleaned = csvText.replace(/^\uFEFF/, '');
    const lines = splitCsvRows(cleaned);
    if (lines.length < 2) return [];

    const header = parseRow(lines[0]).map(h => h.trim());
    if (header[0] !== '제목') {
        throw new Error('CSV 형식이 올바르지 않습니다. 내보내기한 CSV 파일을 사용해주세요.');
    }

    const items = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = parseRow(lines[i]);
        const title = unescapeCsv(cols[0]?.trim());
        if (!title) continue;
        items.push({
            title,
            content: unescapeCsv(cols[1] || ''),
            checked: (cols[2] || '').trim() === '완료',
            color: NAME_COLOR_MAP[(cols[3] || '').trim()] || null,
            dueDate: parseDateString((cols[4] || '').trim()),
            labels: (cols[5] || '').split(',').map(l => l.trim()).filter(Boolean),
            repeatType: (cols[6] || '').trim() || null,
            createdByNickname: (cols[7] || '').trim() || '',
        });
    }
    return items;
}
