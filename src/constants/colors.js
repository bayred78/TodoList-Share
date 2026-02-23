// 체크리스트 및 페이지 중요도 표시용 6단계
export const LABEL_COLORS = [
    { id: 'rank1', hex: '#EF4444', name: '1순위' },
    { id: 'rank2', hex: '#F97316', name: '2순위' },
    { id: 'rank3', hex: '#EAB308', name: '3순위' },
    { id: 'rank4', hex: '#22C55E', name: '4순위' },
    { id: 'rank5', hex: '#94A3B8', name: '5순위' },
];

export const COLOR_MAP = Object.fromEntries(LABEL_COLORS.map(c => [c.id, c.hex]));

// 레거시 색상 ID → 순위 ID 매핑 (기존 데이터 호환)
export const LEGACY_COLOR_MAP = {
    coral: 'rank1',
    peach: 'rank2',
    gold: 'rank3',
    mint: 'rank4',
    sky: 'rank5',
    lavender: 'rank5',
};

// 기존 데이터의 색상 ID를 순위 ID로 변환
export function normalizeColorId(colorId) {
    if (!colorId) return null;
    if (LEGACY_COLOR_MAP[colorId]) return LEGACY_COLOR_MAP[colorId];
    return colorId;
}
