import { ENGINE_VERSION, RULE_VERSION } from "../core";
import { CORPUS_VERSION } from "../data/evidence";
export function Rules() {
  return (
    <div className="page-width rules-page">
      <div className="page-heading">
        <h1>一课的来路，清楚可见。</h1>
        <p>古法有异说。本工具固定取法，公开计算步骤，保留可核验的依据。</p>
      </div>
      <div className="rules-layout">
        <aside className="rules-index">
          <a href="#/rules">取法与版本</a>
          <p>
            引擎 {ENGINE_VERSION}
            <br />
            规则 {RULE_VERSION}
            <br />
            文献 {CORPUS_VERSION}
          </p>
        </aside>
        <div className="rules-content">
          <section>
            <h2>从时间，到四课三传</h2>
            <ol className="process-list">
              <li>
                <span>01</span>
                <div>
                  <h3>确定真实时刻</h3>
                  <p>
                    输入为北京时间 UTC+8，支持公历 2000—2100
                    年。使用真太阳时，需要提供所在地经度；定位为主动授权，不自动假定你位于某座城市。
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>校正真太阳时</h3>
                  <p>
                    按太阳时角计算经度修正与均时差，处理跨日。以所选钟面确定占时、子初
                    23:00 换日以及昼夜；标准时和真太阳时可同时对照。
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>月将加占时</h3>
                  <p>
                    月将按真实时刻的中气交接，月建另按节交接。十干寄宫，以干上、干阴、支上、支阴组成四课。
                  </p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <h3>依九宗门取三传</h3>
                  <p>
                    实现贼克、比用、涉害、遥克、昴星、别责、八专、伏吟、返吟。涉害采用深浅法；处理比用、重复课、涉害复等、自刑、返吟无克等例外。
                  </p>
                </div>
              </li>
              <li>
                <span>05</span>
                <div>
                  <h3>据盘选文，再作解释</h3>
                  <p>
                    程序选择与课盘条件相符的已核条文。古籍原话直接来自校录库；AI
                    只解释现有盘面与证据，不决定课盘，也不编写引文。
                  </p>
                </div>
              </li>
            </ol>
          </section>
          <section>
            <h2>冻结的规则口径</h2>
            <table className="data-table rule-table">
              <tbody>
                {[
                  [
                    "规则主线",
                    "《六壬大全》正文通行体系；校录影像的具体阁本仍按书目状态标示，不冒称已经核定。",
                  ],
                  [
                    "换日",
                    "所选时间口径的 23:00 子初换日。这是本产品选定口径，不声称古籍只有这一种取法。",
                  ],
                  [
                    "昼夜",
                    "卯、辰、巳、午、未、申为昼，酉至寅为夜；不按当地日出日落切换。",
                  ],
                  [
                    "贵人",
                    "甲戊庚昼丑夜未；乙己昼子夜申；丙丁昼亥夜酉；辛昼午夜寅；壬癸昼巳夜卯。",
                  ],
                  [
                    "年命",
                    "只使用用户明确提供的本命与行年地支；不从问题中猜测，不擅自计算生日。",
                  ],
                  [
                    "古课复核",
                    "人工指定有效日干支、月将、占时和昼夜，不从虚构日期倒推。",
                  ],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section>
            <h2>为何不同问题可能得到同一课盘？</h2>
            <p>
              时间起课依据时间与取法。同一时刻、同一地点、同一口径，可以得到相同的四课三传。具体问题影响取用与解释，不作为随机改变课盘的种子。
            </p>
            <p>
              改变时间也不一定换盘：如果仍在同一时辰、干支日与月将范围内，课盘可以保持不变。
            </p>
          </section>
          <section>
            <h2>资料与解释的边界</h2>
            <p>
              只有逐条对照影像核过的文字才进入原文区。未核正文、存疑字和现代批注不冒充古籍原话。书目页面展示资料当前进度，不把已下载称作已校勘。
            </p>
            <p>
              古籍真实、排盘符合选定规则，并不能证明预测一定准确。本工具作为传统术数研究与个人思考的参考；医学、法律或投资决定仍需依靠现实证据与相应专业判断。
            </p>
          </section>
          <section>
            <h2>你的问题如何被处理</h2>
            <p>
              排盘在当前浏览器完成。启用 AI
              时，问题和必要课盘资料才会发送到后端及
              DeepSeek；模型密钥不进入网页。网站不主动存储完整问题与报告。保存到本机由你主动操作，清除浏览器数据会删除本机记录。
            </p>
            <p>
              城市坐标为 GeoNames
              城市中心参考坐标，采用其署名许可；可以用手动经纬度或浏览器定位替换。
            </p>
          </section>
          <a
            className="text-link"
            href="https://github.com/999888666jiang-dev/daliuren"
            target="_blank"
            rel="noreferrer"
          >
            查看源码、测试与校勘记录 ↗
          </a>
        </div>
      </div>
    </div>
  );
}
