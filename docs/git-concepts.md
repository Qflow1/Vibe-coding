# Git 与 GitHub 概念问答

> 写给未来的我。每当 Git 报错或忘记某个概念时，先来这里查。
> 新增概念请用 Q&A 格式补充到对应分类下。

---

## Q1：什么是 Personal Access Token（PAT）？怎么生成？

**A**：PAT 是 GitHub 的「应用专用钥匙」。作用类似密码，但是**限定权限** + **可随时撤销**的，比直接用登录密码推代码更安全。

**什么时候需要**：从 2021 年 8 月起，GitHub HTTPS 推送**不再接受账号密码**了，必须用 PAT 或 SSH key 替代。

**生成步骤**（按今天项目推荐）：
1. 浏览器打开 `https://github.com/settings/tokens`，选 **Fine-grained tokens**（比经典 token 更细）
2. 点 **Generate new token**
3. **Token name**：起一个能记住的，比如 `vibe-coding-pc`
4. **Expiration**：选 `30 days` 或 `90 days`（过期比"永不过期"安全）
5. **Resource owner**：`Qflow1`（你自己的账号）
6. **Repository access**：选 `All repositories` 或 `Only select repositories → Vibe-coding`
7. **Permissions → Repository permissions**：只勾 **`Contents: Read and write`**（其他默认全关，按最小权限原则）
8. 滚到底，点 **Generate token**
9. **复制保存** —— 这一长串字符只显示一次，关掉页面就再也看不到，只能重建

**使用方式**：git push 第一次弹窗时，"用户名"填 `Qflow1`，"密码"粘贴 PAT（不是登录密码）。

**泄露后立刻撤销**：Settings → Developer settings → Personal access tokens → 找到那条 → **Revoke**。

---

## Q2：HTTPS 推送 vs SSH 推送，到底用哪个？

**A**：两者都能把代码推到 GitHub，区别是"身份验证方式"。

| 维度 | HTTPS | SSH |
|---|---|---|
| 远程地址长这样 | `https://github.com/Qflow1/Vibe-coding.git` | `git@github.com:Qflow1/Vibe-coding.git` |
| 身份验证 | 账号 + PAT（每次或缓存） | SSH 密钥对（配一次终身使用） |
| 首次配置成本 | 低：复制 PAT 粘贴即可 | 中：要生成 `~/.ssh/id_ed25519` 并把公钥贴到 GitHub |
| 防火墙友好 | ✅ 一般放行 443 端口 | ⚠️ 部分公司网络会挡 22 端口 |
| 推荐场景 | 临时项目、多人共用电脑 | 长期个人项目、习惯命令行的开发者 |

**本项目选择**：HTTPS + PAT。理由：① 配置最简单；② PAT 可设 90 天强制更换（比 SSH 长期不换更安全）；③ 防火墙几乎不挡。

---

## Q3：`.gitignore` 门到底在哪？文件加了名单就一定不会被上传吗？

**A**：`.gitignore` 在 **`git add` 之前**自动过滤，名单里的文件**根本进不了暂存区**，自然不会被 commit 或 push。

**三个常见误区**：

1. **「已经 commit 过的文件，加进 .gitignore 也无效」**
   - `.gitignore` 只对**还没被 Git 追踪的文件**生效。如果某个文件已经 commit 过（哪怕后续删除），它已经在 Git 历史里。要彻底清理需要 `git rm --cached <文件>` 然后再 commit 一次。
   - **典型场景**：你第一天不小心把 `.env` commit 了，第二天才发现。光加进 `.gitignore` 没救，必须额外清理。

2. **「加了 `*.log` 但日志还是被上传了」**
   - 检查这个日志文件是不是之前已经被 commit 过（`git log --all --full-history -- <文件名>`）。如果已 commit，需要先 `git rm --cached`。

3. **「忽略规则写错或被注释掉」**
   - `.gitignore` 用 `#` 开头表示注释。空行会被忽略。
   - 可以用 [gitignore.io](https://www.toptal.com/developers/gitignore) 生成选这个项目的忽略模板，比手写靠谱。

**怎么验证忽略生效**：
```bash
git check-ignore -v <文件名>     # 显示哪一行规则把这个文件忽略了
git status --ignored              # 列出所有被忽略的文件
```

---

## Q4：commit、push 完，GitHub 网页上还是旧版本 —— 为什么？

**A**：99% 的情况是**只 commit 没 push**，或者**推错分支**。

排查顺序：
1. `git log --oneline -5` 看本地有没有新 commit
2. `git status` 看 working tree 是不是干净的
3. `git branch` 看当前在哪个分支
4. `git push` 真的执行了？看终端有没有 `Writing objects: 100%` 的输出
5. 浏览器**强制刷新** GitHub 页面（Ctrl+F5），避免看到缓存

如果以上都对但 GitHub 还是旧版 → 看 `git remote -v` 确认 URL 没指错仓库。

---

> 这个文档会随项目演进不断补充。新问答请按 `Q数字：标题` 格式追加到对应主题。