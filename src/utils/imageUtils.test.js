import { describe, it, expect } from 'vitest';
import { isImageFile, formatFileSize } from './imageUtils';

describe('imageUtils 테스트', () => {
    describe('isImageFile', () => {
        it('이미지 파일 형식(image/jpeg 등)이면 true를 반환한다', () => {
            const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
            expect(isImageFile(file)).toBe(true);
        });

        it('일반 파일 형식(application/pdf 등)이면 false를 반환한다', () => {
            const file = new File([''], 'test.pdf', { type: 'application/pdf' });
            expect(isImageFile(file)).toBe(false);
        });
    });

    describe('formatFileSize', () => {
        it('바이트 단위를 읽기 쉬운 형식으로 변환한다', () => {
            expect(formatFileSize(0)).toBe('0 B');
            expect(formatFileSize(1024)).toBe('1.0 KB');
            expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
            expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
        });
    });
});
