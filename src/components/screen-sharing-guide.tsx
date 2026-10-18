import {
	ArrowRight,
	ChevronDown,
	ExternalLink,
	Laptop,
	Monitor,
	Play,
} from "lucide-react";
import "../screen-sharing-guide.css";

const flow = [
	{
		icon: Laptop,
		who: "発表者のPC",
		title: "共有を準備",
		text: "自分の発表画面を開く",
	},
	{
		icon: Monitor,
		who: "発表者本人",
		title: "見せる画面を選ぶ",
		text: "ブラウザーで共有を許可",
	},
	{
		icon: Play,
		who: "運営・投影用PC",
		title: "映ったら発表開始",
		text: "発表を選び、投影を確認",
	},
];

export function ScreenSharingGuide({ organizer }: { organizer: boolean }) {
	return (
		<section
			className="ug-share-guide"
			id="screen-sharing"
			aria-labelledby="screen-sharing-title"
		>
			<div className="ug-share-heading">
				<h2 id="screen-sharing-title">画面共有のやり方</h2>
				<p>
					{organizer
						? "発表者の準備と、運営の投影操作を分けて確認しましょう。"
						: "共有する画面は発表者本人が選びます。PCで準備して、運営と一緒に表示を確認しましょう。"}
				</p>
			</div>
			<ol className="ug-share-flow" aria-label="画面共有の3段階">
				{flow.map((item, index) => (
					<li key={item.title}>
						<div className="ug-share-flow-top">
							<span>{index + 1}</span>
							<item.icon size={25} aria-hidden="true" />
						</div>
						<small>{item.who}</small>
						<strong>{item.title}</strong>
						<p>{item.text}</p>
					</li>
				))}
			</ol>
			<div className="ug-share-prerequisites">
				<h3>始める前に、3つ確認</h3>
				<ul>
					<li>発表者は、同じイベントに参加登録を済ませます。</li>
					<li>
						スマホで登録した場合は、自分のPC／Macを接続します。PCで画面上部のPCアイコンから「接続用QRを表示する」を押し、登録済みのスマホで読み取って接続を確定します。
					</li>
					<li>
						運営は「LT進行」で発表を追加し、その参加者を発表者に指定します。
					</li>
				</ul>
			</div>
			<div className="ug-share-instructions">
				<div className="ug-share-actor">
					<span>発表者が操作</span>
					<h3>自分のPCで、見せる画面を準備する</h3>
				</div>
				<ol>
					<li>
						<strong>「発表者」画面を開く。</strong>
						<p>
							発表に使うPC／Macで開き、自分の名前と発表タイトルを確認します。「あなたの発表はまだありません」と表示されたら、運営に発表の登録を確認してください。
						</p>
					</li>
					<li>
						<strong>「画面共有を準備する」を押す。</strong>
						<p>
							ブラウザーの画面選択ダイアログが開きます。ここからの操作は、発表者本人が行ってください。
						</p>
					</li>
					<li>
						<strong>
							見せるタブ・ウィンドウ・画面を選び、共有を開始する。
						</strong>
						<p>
							表示される候補から、発表資料が映っているものを選んで、ブラウザーの「共有」などの確定ボタンを押します。選択肢やボタン名はブラウザーによって異なります。
						</p>
						<dl className="ug-share-choices">
							<div>
								<dt>タブ</dt>
								<dd>ブラウザーで開いている発表資料を見せるとき。</dd>
							</div>
							<div>
								<dt>ウィンドウ</dt>
								<dd>スライドなど、1つのアプリの画面を見せるとき。</dd>
							</div>
							<div>
								<dt>画面全体</dt>
								<dd>
									複数のアプリを切り替えて見せるとき。映る範囲を確認しましょう。
								</dd>
							</div>
						</dl>
						<p className="ug-share-tip">
							発表資料の画面を選びましょう。この「使い方ガイド」や「発表者」画面を選ぶと、資料が映りません。音声は共有されません。
						</p>
					</li>
					<li>
						<strong>プレビューと「共有準備完了」を確認する。</strong>
						<p>
							選んだ画面がプレビューに表示されたら、準備完了です。運営が自分の発表を選ぶと会場に投影され、「投影中」と表示されます。発表者画面のタブを閉じずに、資料を操作してください。
						</p>
					</li>
				</ol>
				<a
					className="wc-button wc-secondary ug-share-link"
					href="/speaker"
					target="_blank"
					rel="noopener noreferrer"
				>
					PCで発表者画面を開く
					<ExternalLink size={17} aria-hidden="true" />
					<span className="ug-share-sr-only">（新しいタブで開く）</span>
				</a>
			</div>
			<div className="ug-share-instructions ug-share-operator">
				<div className="ug-share-actor">
					<span>運営が操作</span>
					<h3>会場に映してから、タイマーを開始する</h3>
				</div>
				<ol>
					<li>
						<strong>投影用PCで「会場スクリーン」を開く。</strong>
						<p>
							プロジェクターや会場ディスプレイにつないだPCで開きます。発表者のPCとは別の、会場に映すための画面です。共有画面とリアクション・コメントが同じページに表示されるので、投影する内容を確認してください。
						</p>
					</li>
					<li>
						<strong>「LT進行」で対象の発表を選ぶ。</strong>
						<p>
							発表者が共有を準備できたら、発表一覧から対象の発表を選びます。その発表者の共有画面が、会場スクリーンに自動で映ります。共有の準備中でも、選択済みの発表者が共有を始めると会場に映ります。
						</p>
					</li>
					<li>
						<strong>会場の表示を確かめて「タイマー開始」を押す。</strong>
						<p>
							発表者と一緒に、正しい資料が読める状態か確認します。次の人へ進むときも、「次の発表へ」→
							投影を確認 →「タイマー開始」の順に操作します。
						</p>
					</li>
				</ol>
				{organizer ? (
					<div className="ug-share-links">
						<a
							className="wc-button wc-secondary ug-share-link"
							href="/screen"
							target="_blank"
							rel="noopener noreferrer"
						>
							投影用PCで会場スクリーンを開く
							<ExternalLink size={17} aria-hidden="true" />
							<span className="ug-share-sr-only">（新しいタブで開く）</span>
						</a>
						<a className="wc-button wc-secondary ug-share-link" href="/admin">
							LT進行を開く
							<ArrowRight size={17} aria-hidden="true" />
						</a>
					</div>
				) : (
					<p className="ug-share-tip">
						発表者は共有する画面の選択を行い、発表の選択・タイマー開始は運営に任せます。
					</p>
				)}
			</div>
			<div className="ug-share-stop">
				<h3>見せる画面を変える・共有を終える</h3>
				<p>
					発表者画面の「共有を停止する」を押します。別の画面へ切り替える場合は、もう一度「画面共有を準備する」を押して選び直してください。発表中に切り替えるときは、先に運営へ声をかけましょう。共有を停止しても、タイマーは自動では止まりません。
				</p>
			</div>
			<section className="ug-share-troubles" aria-label="画面共有で困ったとき">
				{[
					[
						"共有を開始できない・選択をキャンセルした",
						"PC／Macで操作しているか、対象の発表が終了していないか確認します。選択をキャンセルした場合は、もう一度「画面共有を準備する」を押してください。開始できない場合はブラウザーやOSの画面収録の許可を確認し、HTTPSのサイトで開き直します。",
					],
					[
						"自分のプレビューは映るのに、会場に映らない",
						"自分の順番より前は「共有準備完了」で待機します。順番になったら、運営に「LT進行」で対象の発表が選ばれているか、投影用PCで「会場スクリーン」を開いているか確認してもらってください。つながらない場合は両方のPCのネットワーク接続を確認し、運営と共有のやり直しを試します。",
					],
					[
						"「切断」と表示された・ページを再読み込みした",
						"発表者が「画面共有を準備する」を押し、共有する画面を選び直してください。再読み込み前の共有は、自動では再開しません。タイマーの一時停止や再開は運営が操作するので、復旧まで待ってもらう場合は声をかけてください。",
					],
				].map(([question, answer]) => (
					<details key={question}>
						<summary>
							{question}
							<ChevronDown size={19} aria-hidden="true" />
						</summary>
						<p>{answer}</p>
					</details>
				))}
			</section>
		</section>
	);
}
