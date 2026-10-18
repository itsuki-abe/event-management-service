export function OrganizerAccess({
	authorized,
}: {
	authorized: boolean | null;
}) {
	return (
		<section className="wc-access-panel" aria-live="polite">
			{authorized === null ? (
				<p>運営権限を確認しています…</p>
			) : (
				<>
					<h2>運営用リンクから開いてください</h2>
					<p>
						運営チームで共有している運営用リンクから入ると、LT進行とコメント管理を同じ画面から操作できます。
					</p>
					<a href="/engagement">LTライブへ戻る</a>
				</>
			)}
		</section>
	);
}
