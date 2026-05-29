# ComBrief 代码签名

未签名时应用可以运行，但 macOS 可能提示「无法验证开发者」，Windows 可能触发 SmartScreen。正式发布建议在 CI 或本机配置证书。

## macOS

1. 加入 [Apple Developer Program](https://developer.apple.com/programs/)（约 $99/年）
2. 在 Xcode → Settings → Accounts 创建 **Developer ID Application** 证书
3. 导出 `.p12` 并设置环境变量：

```bash
export CSC_LINK=/path/to/developer-id.p12
export CSC_KEY_PASSWORD=your-p12-password
```

4. （推荐）公证（Notarization），避免 Gatekeeper 拦截：

```bash
export APPLE_ID=your@email.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx  # appleid.apple.com 生成
export APPLE_TEAM_ID=XXXXXXXXXX
```

5. 构建：`npm run dist` — electron-builder 会自动签名并公证（配置了上述变量时）

## Windows

1. 购买代码签名证书（如 Sectigo、DigiCert 的 Authenticode 证书）
2. 导出 `.pfx` 并设置：

```bash
export WIN_CSC_LINK=/path/to/cert.pfx
export WIN_CSC_KEY_PASSWORD=your-pfx-password
```

3. 在 `electron-builder.yml` 中将 `signAndEditExecutable` 改为 `true`（有证书时）
4. 构建：`npm run dist`

## GitHub Actions

在仓库 Settings → Secrets 中添加上述变量，Release workflow 构建时会自动使用。本地无证书时可留空，产物仍为未签名安装包。

## 当前状态

- 项目已配置 `build/icon.png` 作为应用图标
- `package.json` 已添加 `author` 字段
- 无证书时 electron-builder 跳过签名，不影响构建
