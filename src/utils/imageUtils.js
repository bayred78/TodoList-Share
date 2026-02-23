/**
 * 이미지 리사이즈 유틸리티
 * 업로드 전에 Canvas API를 사용하여 이미지를 최적 크기로 리사이즈합니다.
 */

const DEFAULT_MAX_WIDTH = 1280;
const DEFAULT_MAX_HEIGHT = 1280;
const DEFAULT_QUALITY = 0.8; // JPEG 품질 (0~1)

/**
 * File/Blob 이미지를 리사이즈하여 최적화된 Blob으로 반환
 * @param {File|Blob} file - 원본 이미지 파일
 * @param {Object} options - 옵션
 * @param {number} options.maxWidth - 최대 너비 (기본 1280)
 * @param {number} options.maxHeight - 최대 높이 (기본 1280)
 * @param {number} options.quality - JPEG 품질 0~1 (기본 0.8)
 * @returns {Promise<{blob: Blob, width: number, height: number, originalSize: number, resizedSize: number}>}
 */
export async function resizeImage(file, options = {}) {
    const {
        maxWidth = DEFAULT_MAX_WIDTH,
        maxHeight = DEFAULT_MAX_HEIGHT,
        quality = DEFAULT_QUALITY,
    } = options;

    const originalSize = file.size;

    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);

            let { width, height } = img;

            // 이미 작으면 리사이즈 불필요
            if (width <= maxWidth && height <= maxHeight && originalSize <= 500 * 1024) {
                // 500KB 이하 + 크기 조건 만족 → 원본 그대로 반환
                resolve({
                    blob: file,
                    width,
                    height,
                    originalSize,
                    resizedSize: originalSize,
                });
                return;
            }

            // 비율 유지하며 리사이즈
            const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
            const newWidth = Math.round(width * ratio);
            const newHeight = Math.round(height * ratio);

            const canvas = document.createElement('canvas');
            canvas.width = newWidth;
            canvas.height = newHeight;

            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, newWidth, newHeight);

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        reject(new Error('이미지 리사이즈에 실패했습니다.'));
                        return;
                    }
                    resolve({
                        blob,
                        width: newWidth,
                        height: newHeight,
                        originalSize,
                        resizedSize: blob.size,
                    });
                },
                'image/jpeg',
                quality
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('이미지를 로드할 수 없습니다.'));
        };

        img.src = url;
    });
}

/**
 * 파일이 이미지인지 확인
 * @param {File} file
 * @returns {boolean}
 */
export function isImageFile(file) {
    return file && file.type && file.type.startsWith('image/');
}

/**
 * 파일 크기를 사람이 읽기 쉬운 형태로 변환
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
