const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'src', 'data', 'questions.json');
const questions = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const fixes = {
  229: "show spanning-tree出力からルートポート、指定ポート、ブロッキングポートを判断します。ルートポートはルートブリッジへの最低コストパスを持つポートで、各非ルートブリッジに1つ存在します。",
  274: "SW4のGi0/2をトランクモードに設定し、許可VLANを指定します。スイッチ間のトランクリンクでは802.1Qカプセル化とallowed VLANの設定が必要です。",
  280: "L2 LACP EtherChannel設定: interface rangeでメンバーポートを選択し、switchport mode trunk + channel-group [番号] mode activeを設定。両端の物理設定（速度、デュプレックス、VLAN）を一致させます。",
  281: "VLAN（Virtual LAN）は個別のブロードキャストドメインを作成するスイッチング概念です。各VLANは独立したブロードキャストドメインとなり、異なるVLAN間の通信にはL3ルーティングが必要です。",
  286: "LACP（Link Aggregation Control Protocol）はIEEE 802.3adで標準化されたプロトコルで、複数の物理ポートを1つの論理リンクに集約しネゴシエーションを行います。active/passiveモードで動作します。",
  287: "LACP EtherChannelの問題: 両端のchannel-groupモードが互換性のある組み合わせ（active-active、active-passive）である必要があります。mode onはLACPネゴシエーションを使用しないため、LACP側とは互換性がありません。",
  297: "スイッチポートにアクセスVLANとボイスVLANを設定: switchport mode access + switchport access vlan [データVLAN] + switchport voice vlan [音声VLAN]。タグなしフレームはアクセスVLANに割り当てられます。",
  298: "MACアドレステーブルの構築: スイッチは受信トラフィック（ingress）のフレームから送信元MACアドレスを学習し、受信ポートと関連付けてテーブルに登録します。これにより転送先ポートを決定できます。",
  300: "spanning-tree vlan [ID] forward-time [秒] コマンドでリスニング→ラーニングの遷移時間を指定します。forward-timeはリスニング状態とラーニング状態それぞれの滞留時間（デフォルト15秒×2=30秒）を設定します。"
};

let updated = 0;
for (const q of questions) {
  if (fixes[q.number]) {
    q.explanation = fixes[q.number];
    updated++;
  }
}

fs.writeFileSync(FILE, JSON.stringify(questions, null, 2), 'utf8');
console.log(`Fixed ${updated} explanations (batch 2).`);
