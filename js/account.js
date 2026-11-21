// 账户中心：改名、改密码、注销

// ==================== 头像 ====================
function renderAccountAvatar() {
    document.getElementById('accountAvatar').innerHTML = avatarHtml(currentAvatar, currentUsername, 'account-avatar-img')
        + '<span class="account-avatar-edit">更换</span>';
    document.getElementById('accountAvatarName').textContent = currentUsername || '';
    document.getElementById('avatarRemoveBtn').style.display = currentAvatar ? '' : 'none';
}

// 读图 → 居中裁成正方形 → 缩到 256px → 压成 JPEG（太大就降质量）
function makeAvatarDataUrl(file) {
    return new Promise((resolve, reject) => {
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { reject(new Error('只支持 JPG / PNG / WebP 图片')); return; }
        if (file.size > 15 * 1024 * 1024) { reject(new Error('图片太大了（超过 15MB）')); return; }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const side = Math.min(img.naturalWidth, img.naturalHeight);
            if (!side) { reject(new Error('无法读取图片')); return; }
            const size = Math.min(256, side);
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, size, size);
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
            let q = 0.88;
            let data = canvas.toDataURL('image/jpeg', q);
            while (data.length > 250 * 1024 && q > 0.4) { q -= 0.12; data = canvas.toDataURL('image/jpeg', q); }
            resolve(data);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取图片')); };
        img.src = url;
    });
}

function setupAvatarEvents() {
    const input = document.getElementById('avatarFileInput');
    const pick = () => input.click();
    document.getElementById('accountAvatar').addEventListener('click', pick);
    document.getElementById('avatarUploadBtn').addEventListener('click', pick);
    input.addEventListener('change', async () => {
        const file = input.files[0];
        input.value = '';
        if (!file) return;
        const btn = document.getElementById('avatarUploadBtn');
        btn.disabled = true;
        try {
            const image = await makeAvatarDataUrl(file);
            const r = await api('PUT', '/users/me/avatar', { image });
            setCurrentAvatar(r.avatar);
            renderAccountAvatar();
            showToast('头像已更新');
        } catch (e) {
            showToast(e.message || '上传失败');
        } finally {
            btn.disabled = false;
        }
    });
    document.getElementById('avatarRemoveBtn').addEventListener('click', async () => {
        if (!confirm('恢复成默认的首字头像吗？')) return;
        try {
            await api('DELETE', '/users/me/avatar');
            setCurrentAvatar('');
            renderAccountAvatar();
            showToast('已恢复默认头像');
        } catch (e) { showToast(e.message); }
    });
}

function setupAccountEvents() {
    setupAvatarEvents();
    document.getElementById('accountLogoutBtn').addEventListener('click', () => {
        if (confirm('确定要退出登录吗？')) logout();
    });

    // ========== 保存用户名 ==========
    document.getElementById('saveUsernameBtn').addEventListener('click', async () => {
        if (currentRole === 'admin') {
            showToast('管理员账号不支持修改用户名');
            return;
        }
        const input = document.getElementById('accountUsername');
        const newName = input.value.trim();
        if (!newName) { showToast('用户名不能为空'); return; }
        if (newName === currentUsername) { showToast('用户名没有变化'); return; }
        const nameErr = usernameError(newName);
        if (nameErr) { showToast(nameErr); return; }

        const password = prompt('请输入当前密码以确认修改：');
        if (!password) return;

        try {
            const data = await api('PUT', '/users/me/username', { newUsername: newName, password });
            saveSession(data.token, data.username, currentRole);
            updateLoginUI();
            input.value = currentUsername;
            input.dispatchEvent(new Event('input'));
            showToast('用户名修改成功');
        } catch (err) {
            showToast(err.message || '修改失败');
            input.value = currentUsername;
        }
    });

    // ========== 保存密码 ==========
    document.getElementById('savePasswordBtn').addEventListener('click', async () => {
        if (currentRole === 'admin') {
            showToast('管理员密码请前往 Railway 环境变量修改');
            return;
        }
        const oldPwd = document.getElementById('accountOldPassword').value;
        const newPwd = document.getElementById('accountNewPassword').value;
        const confirmPwd = document.getElementById('accountConfirmPassword').value;

        if (!oldPwd || !newPwd || !confirmPwd) { showToast('请填写完整'); return; }
        if (newPwd !== confirmPwd) { showToast('两次输入的新密码不一致'); return; }
        if (newPwd.length < 6) { showToast('新密码至少 6 位'); return; }

        try {
            await api('PUT', '/users/me/password', { oldPassword: oldPwd, newPassword: newPwd });
            ['accountOldPassword', 'accountNewPassword', 'accountConfirmPassword'].forEach(id => {
                document.getElementById(id).value = '';
            });
            // 后端已让所有旧登录失效，需要重新登录
            logout(true);
            showToast('密码修改成功，请用新密码重新登录');
            setTimeout(openLoginModal, 600);
        } catch (err) {
            showToast(err.message || '修改失败');
        }
    });

    // ========== 注销账号 ==========
    document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
        if (currentRole === 'admin') {
            showToast('管理员账号不能注销');
            return;
        }
        const pwdInput = document.getElementById('accountDeletePassword');
        const password = pwdInput.value;
        if (!password) { showToast('请输入密码'); return; }

        if (!confirm('⚠️ 确定要注销账号吗？此操作不可恢复！')) return;
        if (!confirm('再次确认：真的要注销吗？')) return;

        try {
            await api('DELETE', '/users/me', { password });
            pwdInput.value = '';
            logout(true);
            showToast('账号已注销');
        } catch (err) {
            showToast(err.message || '注销失败');
        }
    });
}
