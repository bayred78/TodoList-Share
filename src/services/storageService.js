import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { resizeImage, isImageFile } from '../utils/imageUtils';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB 제한
const UPLOAD_TIMEOUT = 30000; // 30초 타임아웃

/**
 * Promise에 타임아웃을 적용하는 헬퍼
 */
function withTimeout(promise, ms = UPLOAD_TIMEOUT) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('업로드 시간이 초과되었습니다. 네트워크를 확인해주세요.')), ms)
        ),
    ]);
}

/**
 * 이미지 파일 유효성 검증
 */
function validateImageFile(file) {
    if (!isImageFile(file)) throw new Error('이미지 파일만 업로드할 수 있습니다.');
    if (file.size > MAX_FILE_SIZE) throw new Error('파일 크기는 5MB 이하만 가능합니다.');
}

/**
 * 랜덤 ID 생성 (파일명 충돌 방지)
 */
function randomId() {
    return Math.random().toString(36).substring(2, 8);
}

/**
 * 채팅 이미지 업로드
 * Storage 경로: projects/{projectId}/chat/{timestamp}_{random}.jpg
 */
export async function uploadChatImage(projectId, file) {
    validateImageFile(file);
    const { blob } = await resizeImage(file);
    const path = `projects/${projectId}/chat/${Date.now()}_${randomId()}.jpg`;
    const storageRef = ref(storage, path);
    await withTimeout(uploadBytes(storageRef, blob, { contentType: 'image/jpeg' }));
    const downloadUrl = await withTimeout(getDownloadURL(storageRef));
    return { downloadUrl, fileName: file.name || 'image.jpg' };
}

/**
 * 체크리스트 아이템 이미지 업로드
 * Storage 경로: projects/{projectId}/items/{itemId}/{timestamp}_{random}.jpg
 */
export async function uploadItemImage(projectId, itemId, file) {
    validateImageFile(file);
    const { blob } = await resizeImage(file);
    const path = `projects/${projectId}/items/${itemId}/${Date.now()}_${randomId()}.jpg`;
    const storageRef = ref(storage, path);
    await withTimeout(uploadBytes(storageRef, blob, { contentType: 'image/jpeg' }));
    const downloadUrl = await withTimeout(getDownloadURL(storageRef));
    return { downloadUrl, fileName: file.name || 'image.jpg' };
}

/**
 * 체크리스트 아이템 서류 파일 업로드 (이미지 외 모든 파일)
 * Storage 경로: projects/{projectId}/items/{itemId}/{timestamp}_{random}_{safeName}
 */
export async function uploadItemFile(projectId, itemId, file) {
    if (file.size > MAX_FILE_SIZE) throw new Error('파일 크기는 5MB 이하만 가능합니다.');
    const safeName = file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, '_');
    const path = `projects/${projectId}/items/${itemId}/${Date.now()}_${randomId()}_${safeName}`;
    const storageRef = ref(storage, path);
    await withTimeout(uploadBytes(storageRef, file, { contentType: file.type }));
    const downloadUrl = await withTimeout(getDownloadURL(storageRef));
    return { downloadUrl, fileName: file.name, fileSize: file.size, fileType: file.type };
}

/**
 * Blob → Base64 변환 (Capacitor Filesystem용)
 */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * 파일 다운로드 유틸
 * - 네이티브 앱: fetch → 캐시 저장 → 공유 시트 (저장/열기)
 * - 웹: 확인 다이얼로그 → Blob 다운로드
 */
export async function downloadFile(url, fileName) {
    try {
        if (Capacitor.isNativePlatform()) {
            const platform = Capacitor.getPlatform();

            const response = await fetch(url);
            if (!response.ok) throw new Error(`다운로드 실패 (${response.status})`);
            const blob = await response.blob();
            const base64 = await blobToBase64(blob);

            if (platform === 'android') {
                const savePath = `TodoListShare/${fileName}`;
                await Filesystem.writeFile({
                    path: savePath,
                    data: base64,
                    directory: Directory.Documents,
                    recursive: true
                });
                alert(`'내 파일 > 문서(Documents) > TodoListShare' 폴더에 저장되었습니다.`);
            } else {
                const result = await Filesystem.writeFile({
                    path: fileName,
                    data: base64,
                    directory: Directory.Cache,
                });
                await Share.share({ title: fileName, url: result.uri });
            }
        } else {
            if (!window.confirm(`'${fileName}' 파일을 다운로드하시겠습니까?`)) return;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`다운로드 실패 (${response.status})`);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        }
    } catch (e) {
        console.error('downloadFile error:', e);
        alert(`파일 다운로드에 실패했습니다.\n${e.message}`);
    }
}
