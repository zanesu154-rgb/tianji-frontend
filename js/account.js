// 账户中心：改名、改密码、注销

function setupAccountEvents() {
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

        const password = prompt('请输入当前密码以确认修改：');
        if (!password) return;

        try {
            const data = await api('PUT', '/users/me/username', { newUsername: newName, password });
            saveSession(data.token, data.username, currentRole);
            updateLoginUI();
            input.value = currentUsername;
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
