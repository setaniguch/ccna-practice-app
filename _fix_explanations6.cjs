const fs = require('fs');
const q = JSON.parse(fs.readFileSync('src/data/questions.json', 'utf8'));

const fixes = {
  74: "TCPがUDPより適している条件: TCPはデータの信頼性が重要な場合に使用します。3ウェイハンドシェイクで接続を確立し、シーケンス番号、確認応答（ACK）、再送制御でデータの完全な配送を保証します。UDPは接続確立なしで高速にデータを送信しますが、配送保証がないため、パケットの欠落が許容できるリアルタイム通信（VoIP、動画ストリーミング等）に適しています。",

  84: "TCPとUDPの違い: TCPはコネクション型プロトコルで、データ送信前に3ウェイハンドシェイク（SYN→SYN-ACK→ACK）による接続確立が必要です。シーケンス番号と確認応答で信頼性を確保します。UDPはコネクションレス型で接続確立不要、パケット配送の保証なしに高速送信が可能ですが、パケットの喪失や順序逆転が発生する可能性があります。",

  653: "選択肢の中でWPA2 + AESが最強の暗号化の組み合わせです。WPA2はAES-CCMP暗号化を使用し、WPA1のTKIP（RC4ベース）より大幅にセキュリティが向上しています。AES（Advanced Encryption Standard）は128ビットブロック暗号で、現時点で実用的な攻撃方法がありません。WEPやTKIPは既に脆弱性が発見されているため不適切です。",

  877: "特定のインターフェースでCDPを無効にするには、インターフェースコンフィグモードでno cdp enableコマンドを実行します。これにより該当インターフェースからのCDPアドバタイズメント送信と受信が停止され、隣接デバイスへの情報漏洩を防止できます。グローバルのno cdp runは全インターフェースに影響するため、特定インターフェースのみの無効化にはno cdp enableを使用します。",

  924: "show ip routeの出力から検証できるパラメータ: (1)「Gateway of last resort」行の有無でラストリゾートゲートウェイの存在を確認、(2)「D EX」コードはEIGRP外部ルート（再配布されたルート）を示す、(3)ルートのAD/メトリック値でルート優先度を判断。R7がEIGRP再配布ルートを受信している場合、D EXエントリが表示されます。",

  1359: "インターフェースGi1/0/34をアクセスポートとして設定: switchport mode accessでアクセスモードに設定し、switchport access vlan [番号]で適切なVLANに割り当てます。これによりエンドデバイスが指定されたVLANのネットワークサービスにアクセスできるようになります。",

  1368: "支店ルーターのNTP設定: ntp server 172.24.54.8コマンドで本社のNTPサーバー（172.24.54.8）から時刻を同期します。NTPはネットワーク全体の時刻を統一し、ログのタイムスタンプ整合性、証明書の有効性確認、スケジュールタスクの正確な実行に必要です。"
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
console.log(`Fixed ${fixCount} explanations (batch 6).`);
