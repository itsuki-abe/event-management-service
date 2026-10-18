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
						運営チームで共有している運営用リンクから入ると、LT進行・コメント・会場案内を同じ運営メニューから管理できます。
					</p>
					<a href="/screen">LTライブへ戻る</a>
				</>
			)}
		</section>
	);
}
