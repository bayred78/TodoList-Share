import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import { resizeImage, isImageFile } from '../utils/imageUtils';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB 제한

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
 * @param {string} projectId
 * @param {File} file
 * @returns {Promise<{downloadUrl: string, fileName: string}>}
 */
export async function uploadChatImage(projectId, file) {
    validateImageFile(file);
    const { blob } = await resizeImage(file);
    const path = `projects/${projectId}/chat/${Date.now()}_${randomId()}.jpg`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
    const downloadUrl = await getDownloadURL(storageRef);
    return { downloadUrl, fileName: file.name || 'image.jpg' };
}

/**
 * 체크리스트 아이템 이미지 업로드
 * Storage 경로: projects/{projectId}/items/{itemId}/{timestamp}_{random}.jpg
 * @param {string} projectId
 * @param {string} itemId
 * @param {File} file
 * @returns {Promise<{downloadUrl: string, fileName: string}>}
 */
export async function uploadItemImage(projectId, itemId, file) {
    validateImageFile(file);
    const { blob } = await resizeImage(file);
    const path = `projects/${projectId}/items/${itemId}/${Date.now()}_${randomId()}.jpg`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
    const downloadUrl = await getDownloadURL(storageRef);
    return { downloadUrl, fileName: file.name || 'image.jpg' };
}

/**
 * 체크리스트 아이템 서류 파일 업로드 (이미지 외 모든 파일)
 * Storage 경로: projects/{projectId}/items/{itemId}/{timestamp}_{random}_{safeName}
 * @param {string} projectId
 * @param {string} itemId
 * @param {File} file
 * @returns {Promise<{downloadUrl: string, fileName: string, fileSize: number, fileType: string}>}
 */
export async function uploadItemFile(projectId, itemId, file) {
    if (file.size > MAX_FILE_SIZE) throw new Error('파일 크기는 5MB 이하만 가능합니다.');
    const safeName = file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, '_');
    const path = `projects/${projectId}/items/${itemId}/${Date.now()}_${randomId()}_${safeName}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, { contentType: file.type });
    const downloadUrl = await getDownloadURL(storageRef);
    return { downloadUrl, fileName: file.name, fileSize: file.size, fileType: file.type };
}
