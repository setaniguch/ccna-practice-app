const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'src', 'data', 'questions.json');
const questions = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const fixes = {
  80: "Cisco Unified Wireless Network（CUWN）はRRM（Radio Resource Management）機能により、クライアント負荷とバックグラウンドノイズを分析し、チャネルを動的に割り当てて干渉を最小化します。",
  90: "ルーティングテーブルで10.10.13.0/25に一致するルートを確認します。最も低いAD（Administrative Distance）を持つルートが優先されます。[1/0]=直接接続、[108/0]=EIGRP内部、[110/2]=OSPF。",
  100: "プライベートIPv4アドレスはインターネットにルーティングされないため、他の内部ホストとのみ通信するホストに最適です。外部と通信するにはNATが必要になります。",
  145: "この問題はレイヤー3スイッチのルーテッドポート設定です。no switchportでL3ポートに変更し、ip addressでIPアドレスを設定します。サブネット化とは別のトピックです。",
  180: "Voice over WLAN展開にはPlatinum QoSプロファイルを選択します。WLCのQoSプロファイル: Platinum=Voice（最高優先）、Gold=Video、Silver=Best Effort、Bronze=Background。",
  186: "ネイティブVLANの不一致: 2台のスイッチのトランクリンクでネイティブVLANが異なると、VLANタグの処理が不一致となりCDP警告が表示され通信が失敗します。switchport trunk native vlanを統一する必要があります。",
  190: "EtherChannelをネゴシエーションプロトコルなし（PAgP/LACPなし）で設定するにはmode onを使用します。両端をonに設定すると静的にEtherChannelが形成されますが、障害検知機能は失われます。",
  191: "Lightweight（軽量）モードがWLCによるAP管理を可能にします。Lightweight APはCAPWAPトンネル経由でWLCと通信し、設定や制御をWLCから一元的に受け取ります。",
  197: "Cisco IP電話はPCからのタグなし（untagged）データトラフィックを変更せずにそのまま通過させます。電話機はPCのデータVLANトラフィックを透過的に転送し、自身の音声トラフィックのみVoice VLANでタグ付けします。",
  199: "VLAN 67をネイティブVLAN（タグなし）として通信するには、switchport trunk native vlan 67を設定します。これによりVLAN 67のフレームはトランクリンク上でタグなしで送信されます。",
  200: "L3 EtherChannelをオープンスタンダード（LACP）で設定: (1)port-channelインターフェースにno switchport+IPアドレス設定、(2)物理インターフェースにchannel-group mode active（LACP）を設定。",
  279: "LACP EtherChannelで静的設定（mode on）が一端にある場合、相手側もmode onでなければ不一致になります。LACPを使用する場合はactive/passiveに統一する必要があります。",
  283: "WLCでLAGを有効化または無効化した後、変更を反映するためにコントローラの再起動が必要です。LAG設定変更はリアルタイムには適用されません。",
  285: "自律APが複数のVLANをWLANにマッピングする場合、有線ネットワークへの接続にはトランクポート（trunk）が必要です。トランクポートは802.1Qタグで複数VLANのトラフィックを伝送します。",
  295: "PortFastはアクセスポートでのみ追加設定なしでサポートされます。エンドデバイス（PC、サーバー等）が接続されるアクセスポートでSTP収束待ち時間をスキップします。",
  299: "EtherChannelの設定: port-channelインターフェースに設定を適用し、物理メンバーインターフェースにchannel-groupコマンドでモード（on/active/passive等）を指定します。"
};

let updated = 0;
for (const q of questions) {
  if (fixes[q.number]) {
    q.explanation = fixes[q.number];
    updated++;
  }
}

fs.writeFileSync(FILE, JSON.stringify(questions, null, 2), 'utf8');
console.log(`Fixed ${updated} explanations.`);
