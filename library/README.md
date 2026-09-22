# 本地古籍资料库

这里保存可复核的版本记录、原始文件哈希和逐页核验记录。扫描文件已实际下载在 `originals/`；全书体积较大，原件和选页研究缓存不推送到 GitHub。发布网页使用 `public/sources/` 内审定引文对应的页面。

- `source-manifest.json`：7 个完整原始文件的来源、大小、SHA-256、Commons 公版标记。
- `verified-pages.json`：已发布页面的哈希、核对范围和核验者；只证明列明的字句/表格经过目视比对。
- `originals/wenyuange-siku-0808.djvu`：景印文渊阁四库全书第808册整册。
- `originals/daquan-volume-*.djvu`：CADAL 来源《六壬大全》卷一、七、九、十一至十二。暂不把该组扫描的阁本认定为文渊阁。
- `originals/yuding-liuren-zhizhi.pdf`：《御定六壬直指》华盛顿大学来源扫描。
- `originals/liuren-cuiyan.pdf`：《六壬粹言》国家图书馆06574号钞本扫描。
- `review/`：下载过程元数据、研究选页、PDF 渲染页；未经核对的页面不会自动进入正式引文库。

重新取原件：`python scripts/fetch-sources.py --originals`（需要 Python 和 requests）。取研究页：`python scripts/fetch-sources.py --review --file daquan-v9 --pages 102,103,105`。重复执行只复用已有文件并重算哈希；下载成功从不自动标为已校。

正式引文见 `src/data/evidence.ts`，百法索引见 `src/data/bifa-index.ts`，版本与授权边界见 `docs/sources.md`。只核了部分条文，没有完成《大全》《直指》的全书校勘，更没有“全网权威秘术已收齐”。
