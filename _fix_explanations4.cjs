const fs = require('fs');
const q = JSON.parse(fs.readFileSync('src/data/questions.json', 'utf8'));

const fixes = {
  98: "IPv6アドレスの圧縮規則: (1)各グループの先頭の0を省略可能（0001→1）、(2)連続する全0グループは::で1回だけ省略可能。2001:0EB8:00C1:2200:0001:0000:0000:0331を圧縮すると2001:EB8:C1:2200:1::331となります。選択肢Aは22を誤って圧縮（2200→22は不可）、Bは2001→21と不正、Cは完全に圧縮されていません。",

  115: "ユニークローカルアドレス（FD00::/8）はインターネットにアドバタイズされないルーティング可能なローカルIPv6アドレスです。VLAN 2000インターフェースにfd00::1234:2343/64を設定することで、内部ネットワーク内でルーティング可能かつインターネットへのアドバタイズがブロックされる要件を満たします。ff00はマルチキャスト、fe80はリンクローカルのため不適切です。",

  185: "STPルートブリッジの選出はブリッジプライオリティ値で決定されます。spanning-tree vlan 750 priority 0はプライオリティを最小値（0）に設定し、そのスイッチが常にVLAN 750のルートブリッジになることを保証します。root primaryコマンドは現在のルートより低い値を設定しますが、将来他のスイッチがより低い値を設定する可能性があるため「常に」の保証にはなりません。",

  189: "show cdp neighborコマンドは直接接続された隣接デバイスの情報（デバイスID、ローカルインターフェース、ホールドタイム、機能、プラットフォーム、ポートID）を表形式で表示します。CDPはCisco独自のレイヤー2プロトコルで、隣接デバイスの検出に使用されます。",

  193: "lldp reinitコマンドはLLDPを初期化するための遅延時間（秒）を指定します。ポートがLLDPを再初期化する前の待機時間を設定し、リンクフラップ時の過剰なLLDPフレーム送信を防止します。lldp timerは送信間隔、lldp holdtimeは情報保持時間、lldp tlv-selectは送信するTLVの選択です。",

  282: "CDPのタイマー設定: cdp timer 10コマンドはCDPアドバタイズメントの送信間隔を10秒に短縮します（デフォルト60秒）。送信間隔を短くすることで隣接デバイスがスイッチCat9300をより素早く検出できます。cdp holdtimeは情報の保持時間であり、検出速度には直接影響しません。また設定はCat9300側（送信側）で行います。",

  288: "インターフェースでCDPとLLDPの両方を無効にするには: no cdp enable（CDPをインターフェースで無効化）とno lldp transmit / no lldp receive（LLDPの送受信を無効化）を設定します。no cdp runはグローバルで全インターフェースのCDPを無効にするため、特定インターフェースのみの要件には不適切です。",

  292: "EtherChannelのLACP設定: 一方がpassiveモードの場合、もう一方はactiveモードでなければネゴシエーションが確立しません（passive同士では確立不可）。Switch2のLACPモードをactiveに変更することで、相手のpassiveモードとネゴシエーションが成立し、EtherChannelが確立されます。",

  971: "Telnetは通信を暗号化せず平文でデータを送信するため、中間者攻撃（MITM）に脆弱です。攻撃者がネットワーク上のトラフィックを傍受すると、認証情報や管理コマンドがすべて読み取られます。SSHやHTTPSは暗号化により保護され、コンソールは物理接続のためネットワーク経由の攻撃対象になりません。",

  1056: "異なるベンダー間のトランクリンク設定: switchport mode trunkでトランクモードを設定し、switchport trunk encapsulation dot1qでIEEE 802.1Q（業界標準）カプセル化を指定します。ISLはCisco独自のためマルチベンダー環境では使用不可。すべてのVLANを通過させるにはデフォルト設定（allowed vlan all）で十分なため、明示的に指定する必要はありません。",

  1339: "EtherChannelのport-channel min-linksコマンドは、チャネルグループがアクティブであるために必要な最小リンク数を指定します。Ge0/0とGe0/1がダウンした場合にPort Channelを無効にするには、min-linksを適切な値に設定して、アクティブリンク数がその値を下回った時にポートチャネル全体を非アクティブにします。"
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
console.log(`Fixed ${fixCount} explanations (batch 4).`);
