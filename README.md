# oh-story dsh plugin(DeepSFV 分支)

> **Release v0.3.0** · 2026-09-12 · 基线:DeepSFV 3080 harness(907harness @ feature/deepsfv 45ae95b92f)
>
> v0.3.0 = v0.2.0 快照 + 手动画布(矢量箭头)+ 分镜字段解析兼容 + DashScope 图片适配器

本仓库为 DeepSFV(深视星影)harness 内运行的 oh-story 插件**当前版本源码快照**,替换旧版单仓结构。五个 workspace 子包:

| 目录 | 包名 | 说明 |
|---|---|---|
| `oh-story-skills/` | `@oh-story/skills` | 23 技能(小说 12 + 短剧 10 + browser-cdp)与知识资产 |
| `oh-story-roles/` | `@oh-story/roles` | 子代理角色定义 |
| `oh-story-workspace/` | `@oh-story/workspace` | 工作区路由(/oh-story/{workspace,file,media})与生产工具 |
| `ui-oh-story/` | `@oh-story/ui` | 制作视图 5 分区(镜头/素材/任务/成片/画布)客户端 |
| `bundle-oh-story/` | `@oh-story/dsh` | 聚合 bundle(release/ 内含自包含 tgz) |

## 2026-09-11 修复:DashScope 图片生成适配器

新增 `oh-story-skills/lib/drama/skills/short-drama-produce/scripts/dashscope_image_adapter.py`:

- 阿里云 DashScope 原生端点 `POST /api/v1/services/aigc/multimodal-generation/generation`(compatible-mode 图片端点不可用)
- 模型默认 `qwen-image-2.0`(env `DASHSCOPE_IMAGE_MODEL` 可换 qwen-image-3.0-pro / wan2.7-image 等)
- 尺寸参数 `W*H`(星号分隔);密钥自动从环境变量或 `.dsh-home/.env` 解析
- 适配 production_tool 契约:stdin job JSON → 写 output_root → stdout 对账 JSON
- 注册进项目外 adapter 配置(名 `dashscope-image`,别名 `gpt-image-2`)

已实测:EP001 角色设定图全管线跑通(prepare → confirm → run → 1.2MB PNG 入 制作成果/images/)。

## 已知限制

- 视频生成(seedance/火山方舟)需 ARK 凭据,未配置
- 五包为 pnpm workspace 子包(workspace:^ 依赖),须在 harness monorepo 内构建运行,不可独立安装
