需求
插件范围curated后端服务端，服务器ip:8081

根据API文档获取查询影片的能力

在目标网址中解析影片卡片中的番号查询当前服务器是否有对应的影片，影片有则主动在tag中标记已入库，没有则在tag中标记为未入库

插件需求
1. 访问服务端
2. 查询影片检查是否入库
3. 根据入库情况打标签
4. 有ui可以配置服务端ip
5. 要求可以被服务端识别为Curated-Plugin


目标网址
https://javdb.com/users/want_watch_videos
页面中的影片卡片元素
```json
{
  "id": "字符串，影片唯一标识",
  "link": "字符串，影片详情页完整URL",
  "cover": "字符串，封面图片URL",
  "code": "字符串，番号",
  "title": "字符串，完整标题",
  "score": "数字，平均评分（1-5）",
  "rating_count": "数字，评价人数",
  "date": "字符串，发布日期（YYYY-MM-DD）",
  "tags": ["字符串数组，标签列表，可能包含\"含磁鏈\"、\"含中字磁鏈\"等"],
  "playable": "布尔值，是否可在线播放",
  "cn_sub": "布尔值（可选），当标签含\"中字\"时出现，表示是否有中文字幕"
}

{
	"id": "xArVx8",
	"link": "https://javdb.com/v/xArVx8",
	"cover": "https://c0.jdbstatic.com/covers/xa/xArVx8.jpg",
	"code": "NIMA-065",
	"title": "【FANZA限定】実写版！社畜OLちゃんの憂鬱 届け☆退職願編 桃園怜奈 椿りか 生写真付き",
	"score": 4,
	"rating_count": 837,
	"date": "2025-11-19",
	"tags": ["含中字磁鏈"],
	"playable": true,
	"cn_sub": true
}
```
卡片的html标签元素
```html
<div class="item" id="video-a83Y1R">
  <div class="box">
    <a href="/v/a83Y1R">
      ...
    </a>
  </div>
</div>
```

chrome插件程序提取影片卡片内容
```js
// content.js
(function () {
  'use strict';

  /**
   * 解析评分文本中的数字，例如 "4分, 由26人評價" -> { score: 4, count: 26 }
   */
  function parseScoreText(text) {
    const scoreMatch = text.match(/(\d+)分/);
    const countMatch = text.match(/(\d+)人評價/);
    return {
      score: scoreMatch ? parseInt(scoreMatch[1]) : 0,
      ratingCount: countMatch ? parseInt(countMatch[1]) : 0
    };
  }

  /**
   * 从单个 .item 卡片提取影片信息
   */
  function extractCard(card) {
    const id = card.id.replace('video-', '');

    const linkEl = card.querySelector('.box > a');
    const link = linkEl ? linkEl.href : '';

    const coverEl = card.querySelector('.cover img');
    const cover = coverEl ? coverEl.src : '';

    const titleDiv = card.querySelector('.video-title');
    let code = '';
    let title = '';
    if (titleDiv) {
      const strong = titleDiv.querySelector('strong');
      if (strong) {
        code = strong.textContent.trim();
        // 获取完整文本，再移除番号部分得到剩余标题
        const fullText = titleDiv.textContent.replace(/\s+/g, ' ').trim();
        title = fullText.replace(code, '').trim();
      } else {
        title = titleDiv.textContent.trim();
      }
    }

    const valueEl = card.querySelector('.score .value');
    const { score, ratingCount } = valueEl
      ? parseScoreText(valueEl.textContent)
      : { score: 0, ratingCount: 0 };

    const metaEl = card.querySelector('.meta');
    const date = metaEl ? metaEl.textContent.trim() : '';

    const tagEls = card.querySelectorAll('.tags .tag');
    const tags = Array.from(tagEls).map(tag => tag.textContent.trim());

    const playableTag = card.querySelector('.tag-can-play');
    const playable = !!playableTag;
    let cnSub = false;
    if (playableTag) {
      cnSub = playableTag.classList.contains('cnsub') || playableTag.textContent.includes('中字');
    }

    return {
      id, link, cover, code, title, score, rating_count: ratingCount,
      date, tags, playable, cn_sub: cnSub || undefined
    };
  }

  /**
   * 提取当前页面所有影片卡片
   */
  function extractAllCards() {
    const cards = document.querySelectorAll('#videos .item');
    return Array.from(cards).map(extractCard).filter(Boolean);
  }

  // 将数据暴露到全局，供 popup 或其他脚本通过 chrome.runtime 获取
  // 也可以通过 chrome.runtime.sendMessage 主动发送
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getMovies') {
      const movies = extractAllCards();
      sendResponse({ movies });
    }
  });

  // 可选：提取完毕时通知 popup
  // chrome.runtime.sendMessage({ action: 'moviesExtracted', movies: extractAllCards() });
})();
```