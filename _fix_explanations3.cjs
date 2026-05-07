const fs = require('fs');
const q = JSON.parse(fs.readFileSync('src/data/questions.json', 'utf8'));

const fixes = {
  183: "LLDPのポート記述TLV送信設定: インターフェースコンフィグモード（config-if）でlldp port-descriptionコマンドを実行します。LLDPはリンク層の近隣探索プロトコルで、TLV（Type-Length-Value）形式で情報を送信します。ポート記述TLVはインターフェース単位の設定のため、config-ifモードが正しいです。",

  294: "TACACS+は認証（Authentication）と認可（Authorization）を個別のプロセスとして処理するため、APの認可と認証を分離して管理できます。RADIUSは認証と認可を1つのプロセスで処理するため分離できません。TACACS+はTCPポート49を使用し、パケット全体を暗号化する点でもセキュリティに優れています。",

  347: "ルーターはロンゲストプレフィックスマッチ（最長一致）に基づいてルートを選択します。192.168.12.16に対して、/28や/26などより長いプレフィックスを持つRIPルートが存在する場合、AD（アドミニストレーティブディスタンス）やメトリックに関係なく、そのRIPルートが選択されます。ロンゲストマッチは他のすべての選択基準に優先します。",

  349: "ルーターはロンゲストプレフィックスマッチ（最長一致）に基づいてルートを選択します。192.168.10.16に対して最も長い（具体的な）プレフィックスを持つRIPルートがルーティングテーブルに存在するため、ADやメトリックに関係なくそのルートが優先されます。ロンゲストマッチはルート選択の最優先基準です。",

  426: "ip route 0.0.0.0 0.0.0.0 10.13.0.1 120はAD=120のフローティングスタティックデフォルトルートです。既存のOSPFデフォルトルート（AD=110）の方がADが低いため優先されます。OSPFデフォルトルートが削除（無効化）されるまで、このスタティックルートはルーティングテーブルにインストールされません。フローティングスタティックはバックアップルートとして機能します。",

  490: "要件を満たす2つのコマンド: (B) ipv6 route 2001:db8:23::14/128 fd00:13::3 → ホスト2001:db8:23::14宛をR3（fd00:13::3）経由で優先転送（/128ホストルートが最長一致で優先）。(C) ipv6 route 2001:db8:23::/64 fd00:12::2 → ネットワーク2001:db8:23::/64全体をR2（fd00:12::2）経由で転送。この組み合わせで両方の要件を満たします。",

  509: "IP SLAでUDPジッター測定にはNTP（Network Time Protocol）が必要です。ジッターはパケット到着時間のばらつきを測定するため、送信元と宛先の両デバイスで正確な時刻同期が不可欠です。NTPがないと正確なタイムスタンプ比較ができず、ジッター計算が不正確になります。",

  577: "STP（スパニングツリープロトコル）が原因でDHCPアドレスを受信できなくなることがあります。STPのポート状態遷移（Listening→Learning→Forwarding）に最大50秒かかるため、PCが接続直後にDHCP Discoverを送信しても、ポートがまだForwarding状態になっておらずフレームが破棄されます。PortFastを設定することでアクセスポートを即座にForwarding状態にし、この問題を解決できます。",

  593: "正解はDNS Serversの設定変更です。PCがwww.cisco.comにアクセスする際、まずドメイン名をIPアドレスに解決する必要があります。DNSサーバーが正しく設定されていないと名前解決ができず、接続に失敗します。IPアドレス直接指定なら接続できる場合、DNS設定の問題です。",

  738: "出力に表示されているのはPuppetの設定（マニフェスト）です。Puppetはリソースタイプ（file, package, service等）を宣言的に定義する独自のDSL（Domain Specific Language）を使用します。AnsibleはYAML形式のPlaybook、ChefはRubyベースのRecipe、JSONはデータ形式であり設定管理ツールではありません。",

  829: "正解は物理エラー（Physical errors）です。show interfaceの出力でCRCエラー、input errors、frame errors等のカウンターが増加している場合、ケーブルの損傷、コネクタの不良、EMI（電磁干渉）などの物理層の問題が根本原因です。これらのエラーにより再送が発生し、ネットワークの低速化を引き起こします。",

  910: "正解はipv6 address dhcpです。このコマンドはDHCPv6クライアントとしてインターフェースを設定し、DHCPv6サーバーからIPv6アドレスを取得します。ipv6 address autoconfigはSLAAC（RA+EUI-64）による自動設定で、DHCPv6とは異なります。図の要件ではDHCPv6による取得が必要なため、dhcpオプションが正解です。",

  940: "フローティングスタティックデフォルトルートは、より低いADを持つ動的ルート（ここではeBGP、AD=20）が有効な間はルーティングテーブルにインストールされません。eBGPで学習したデフォルトルートが無効（ネイバーダウン等）になった時点で、スタティックルートのADが最小となりルーティングテーブルに挿入されます。",

  984: "正解Aの設定: username test1 password testpass1（ローカルユーザー作成）、enable secret level 15 0 Test123（enableパスワードをプレーンテキストで入力しつつ安全に保存）。enable secretはパスワードをMD5/SHA256でハッシュ化して保存するため安全です。enable passwordは暗号化が弱いため要件を満たしません。level 15でフルアクセスを付与します。",

  1012: "HTTP PUTメソッドは既存のリソースを完全に置き換える（更新する）ために使用されます。選択肢Aの「DNSサーバーを更新する場合」はリソースの更新操作に該当するためPUTが適切です。GETは読み取り専用（表示）、POSTはべき等でない新規作成に使用されます。PUTはべき等（同じリクエストを何度送っても同じ結果）です。",

  1036: "正解Cの設定: switchport trunk encapsulation dot1qで業界標準のトランクプロトコル（IEEE 802.1Q）を指定し、switchport mode trunkでトランクモードに設定、switchport trunk allowed vlan 1-10でVLAN 1-10のみ許可します。dot1qはISL（Cisco独自）と異なり業界標準であるため要件を満たします。",

  1154: "ライトウェイトモードのAPはWLC（Wireless LAN Controller）によりCAPWAP（Control and Provisioning of Wireless Access Points）トンネルを通じて集中管理されます。設定変更はすべてWLCのGUI/CLIから行い、CAPWAPプロトコル経由でAPに配信されます。APに直接SSH/HTTPSでログインして設定することはできません。",

  1318: "OSPFネイバー関係を確立するには、両端でhello-intervalとdead-intervalが一致している必要があります。R1のhello-intervalがデフォルト（10秒）の場合、R2も同じ値に設定する必要があります。ip ospf hello-interval 10コマンドでR2のインターフェースg0/0/0のhello間隔を10秒に設定し、R1と一致させることでネイバー関係が確立されます。"
};

let fixCount = 0;
Object.entries(fixes).forEach(([num, explanation]) => {
  const idx = q.findIndex(x => x.number === parseInt(num));
  if (idx !== -1) {
    q[idx].explanation = explanation;
    fixCount++;
  } else {
    console.log(`Warning: Q${num} not found`);
  }
});

fs.writeFileSync('src/data/questions.json', JSON.stringify(q, null, 2), 'utf8');
console.log(`Fixed ${fixCount} explanations (batch 3).`);
