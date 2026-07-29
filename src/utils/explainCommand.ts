/**
 * Cisco IOS コマンドを解析し、「なぜそのコマンドか／値の意味は何か」を
 * 日本語で説明する文字列を動的生成するユーティリティ。
 *
 * ラボ問題の模範解答の各行の下に解説を差し込む用途で使用する。
 * データ側にコマンドごとの解説を持たせるのではなく、コマンド文字列を
 * パターンマッチして説明を組み立てる（新しい問題にも自動対応できる）。
 *
 * マッチしないコマンドは空文字列を返す（UI 側で解説行を省略する）。
 */

/** VLAN リスト "56,77,99" → "56, 77, 99" */
function vlanList(list: string): string {
  return list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}

interface Rule {
  re: RegExp;
  explain: (m: RegExpMatchArray) => string;
}

// 具体的なパターンを先に、汎用的なものを後に置く（先勝ち）。
const RULES: Rule[] = [
  // --- モード遷移・保存 ---
  { re: /^enable$/i, explain: () => '特権EXECモード(#)に移行する。設定変更や保存の前提となる管理モード。' },
  {
    re: /^configure terminal$/i,
    explain: () => 'グローバル設定モード(config)に入る。以降のコマンドで機器全体の設定を行う。',
  },
  { re: /^end$/i, explain: () => '設定モードを抜けて特権EXECモードへ戻る（Ctrl+Z と同等）。' },
  { re: /^exit$/i, explain: () => '1つ上のモードへ戻る。' },
  {
    re: /^(write memory|write|wr|copy running-config startup-config)$/i,
    explain: () =>
      '現在の設定(running-config)を起動時設定(startup-config)へ保存する。再起動後も設定を保持するために必要。',
  },

  // --- インターフェース選択 ---
  {
    re: /^interface range (.+)$/i,
    explain: (m) => `複数のインターフェース(${m[1]})をまとめて設定するモードに入る。同じ設定を一括適用できる。`,
  },
  {
    re: /^interface port-channel\s*(\d+)$/i,
    explain: (m) => `論理インターフェース Port-channel ${m[1]}（EtherChannelの束ね口）の設定モードに入る。`,
  },
  {
    re: /^interface vlan\s*(\d+)$/i,
    explain: (m) => `VLAN ${m[1]} のSVI(スイッチ仮想インターフェース)設定モードに入る。VLAN間ルーティングや管理IPに使う。`,
  },
  {
    re: /^interface loopback\s*(\d+)$/i,
    explain: (m) => `ループバックインターフェース ${m[1]}（常時UPの論理IF）の設定モードに入る。Router-IDや検証に使う。`,
  },
  {
    re: /^interface (\S+)$/i,
    explain: (m) => `インターフェース ${m[1]} の設定モードに入る。以降このポートに対する設定を行う。`,
  },

  // --- スイッチポート ---
  { re: /^switchport mode access$/i, explain: () => 'ポートをアクセスモード（単一VLANの端末接続用）に固定する。' },
  { re: /^switchport mode trunk$/i, explain: () => 'ポートをトランクモード（複数VLANをタグ付きで伝送）に固定する。' },
  {
    re: /^switchport access vlan\s*(\d+)$/i,
    explain: (m) => `このアクセスポートを VLAN ${m[1]} に所属させる。接続端末は VLAN ${m[1]} の通信になる。`,
  },
  {
    re: /^switchport trunk encapsulation dot1q$/i,
    explain: () => 'トランクのカプセル化を IEEE 802.1Q に指定する（VLANタグ方式）。',
  },
  {
    re: /^switchport trunk native vlan\s*(\d+)$/i,
    explain: (m) => `ネイティブVLAN（タグを付けずに送るVLAN）を ${m[1]} に設定する。両端で一致させる必要がある。`,
  },
  {
    re: /^switchport trunk allowed vlan\s*(add\s+)?([\d,]+)$/i,
    explain: (m) =>
      `このトランクで通過を許可するVLANを ${vlanList(m[2])} に限定する${m[1] ? '（既存の許可リストに追加）' : '（他のVLANは遮断）'}。`,
  },
  {
    re: /^switchport voice vlan\s*(\d+)$/i,
    explain: (m) => `IP電話用のボイスVLAN ${m[1]} を割り当てる。データVLANと分離して音声を扱う。`,
  },
  { re: /^switchport port-security$/i, explain: () => 'ポートセキュリティを有効化し、接続できるMACアドレスを制限する。' },
  {
    re: /^switchport port-security maximum\s*(\d+)$/i,
    explain: (m) => `このポートで学習を許可する最大MACアドレス数を ${m[1]} に設定する。`,
  },
  {
    re: /^switchport port-security violation (\w+)$/i,
    explain: (m) => `ポートセキュリティ違反時の動作を ${m[1]} に設定する。`,
  },
  {
    re: /^switchport port-security mac-address sticky$/i,
    explain: () => '接続中のMACアドレスを自動学習して設定に固定(sticky)する。手動登録の手間を省く。',
  },
  {
    re: /^switchport port-security mac-address (\S+)$/i,
    explain: (m) => `許可するMACアドレスとして ${m[1]} を静的に登録する。`,
  },
  { re: /^no switchport$/i, explain: () => 'ポートをL2スイッチポートからL3ルーテッドポートに切り替える（IP付与が可能になる）。' },

  // --- EtherChannel ---
  {
    re: /^channel-group\s*(\d+) mode (active|passive|on|desirable|auto)$/i,
    explain: (m) => {
      const mode = m[2].toLowerCase();
      const desc =
        mode === 'active'
          ? 'LACPで能動的に交渉'
          : mode === 'passive'
          ? 'LACPで受動的に交渉'
          : mode === 'on'
          ? 'プロトコルなしで静的に束ねる'
          : mode === 'desirable'
          ? 'PAgPで能動的に交渉'
          : 'PAgPで受動的に交渉';
      return `このインターフェースをEtherChannelグループ ${m[1]} に追加し、${mode} (${desc})する。`;
    },
  },

  // --- 有効化 / 無効化 ---
  { re: /^no shutdown$/i, explain: () => 'インターフェースを有効化(up)する。デフォルトで管理ダウンのポートを起動する。' },
  { re: /^shutdown$/i, explain: () => 'インターフェースを管理的に無効化(down)する。' },
  { re: /^duplex (auto|full|half)$/i, explain: (m) => `デュプレックスを ${m[1]} に設定する。` },
  { re: /^speed (auto|\d+)$/i, explain: (m) => `ポート速度を ${m[1]} に設定する。` },
  { re: /^description (.+)$/i, explain: (m) => `インターフェースに説明「${m[1]}」を付ける（管理用メモ）。` },

  // --- IPアドレス ---
  {
    re: /^ip address dhcp$/i,
    explain: () => 'このインターフェースのIPアドレスをDHCPで自動取得する。',
  },
  {
    re: /^ip address (\S+) (\S+)$/i,
    explain: (m) => `インターフェースにIPアドレス ${m[1]} / サブネットマスク ${m[2]} を設定する。`,
  },
  {
    re: /^ipv6 address (\S+)\s*(eui-64)?$/i,
    explain: (m) =>
      `IPv6アドレス ${m[1]} を設定する${m[2] ? '（ホスト部はEUI-64でMACから自動生成）' : ''}。`,
  },
  { re: /^ipv6 unicast-routing$/i, explain: () => 'IPv6のルーティング機能を有効化する（IPv6転送の前提）。' },

  // --- 静的ルート ---
  {
    re: /^ip route (\S+) (\S+) (\S+) (\d+)$/i,
    explain: (m) =>
      `宛先 ${m[1]}/${m[2]} への静的ルートをネクストホップ ${m[3]} 経由で追加し、アドミニストレーティブディスタンスを ${m[4]}（バックアップ用に大きめ）に設定する。`,
  },
  {
    re: /^ip route (\S+) (\S+) (\d+\.\d+\.\d+\.\d+)$/i,
    explain: (m) => `宛先 ${m[1]}/${m[2]} への静的ルートをネクストホップ ${m[3]} 経由で追加する。`,
  },
  {
    re: /^ip route (\S+) (\S+) (\S+)$/i,
    explain: (m) => `宛先 ${m[1]}/${m[2]} への静的ルートを出力インターフェース ${m[3]} 経由で追加する。`,
  },
  {
    re: /^ipv6 route (\S+) (\S+)(\s+(\d+))?$/i,
    explain: (m) =>
      `IPv6の宛先 ${m[1]} への静的ルートを ${m[2]} 経由で追加する${m[4] ? `（AD=${m[4]}のバックアップ）` : ''}（::/0 はデフォルトルート）。`,
  },

  // --- NAT ---
  { re: /^ip nat inside$/i, explain: () => 'このインターフェースをNATの内側(inside)ネットワーク側に指定する。' },
  { re: /^ip nat outside$/i, explain: () => 'このインターフェースをNATの外側(outside)ネットワーク側に指定する。' },
  {
    re: /^ip nat inside source list (\S+) pool (\S+)(\s+overload)?$/i,
    explain: (m) =>
      `ACL「${m[1]}」に一致する内部送信元アドレスを、プール「${m[2]}」のアドレスに変換する${m[3] ? '（overload=PATでポート多重化）' : ''}。`,
  },
  {
    re: /^ip nat pool (\S+) (\S+) (\S+) netmask (\S+)$/i,
    explain: (m) => `NAT用アドレスプール「${m[1]}」を定義する（変換後アドレス範囲 ${m[2]}〜${m[3]}、マスク ${m[4]}）。`,
  },

  // --- Dynamic ARP Inspection / DHCP Snooping ---
  { re: /^ip arp inspection vlan (.+)$/i, explain: (m) => `VLAN ${m[1]} でダイナミックARPインスペクション(DAI)を有効化し、不正なARPを遮断する。` },
  { re: /^ip arp inspection validate (.+)$/i, explain: (m) => `DAIの追加検証(${m[1]})を有効にし、ARPパケットの整合性チェックを強化する。` },
  { re: /^ip dhcp relay information trusted$/i, explain: () => 'このインターフェースをDHCPリレー情報(option 82)の信頼ポートにする。' },
  { re: /^(no )?ip dhcp snooping(\s+(.+))?$/i, explain: (m) => (m[1] ? `DHCPスヌーピングの設定(${m[3] ?? ''})を無効化する。` : 'DHCPスヌーピングを有効化し、信頼できないポートからの不正なDHCP応答を遮断する。') },

  // --- OSPF ---
  { re: /^router ospf\s*(\d+)$/i, explain: (m) => `OSPFプロセス ${m[1]} を起動し、ルーティング設定モードに入る。` },
  {
    re: /^network (\S+) (\S+) area\s*(\d+)$/i,
    explain: (m) => `${m[1]}（ワイルドカードマスク ${m[2]}）に該当するインターフェースをOSPFエリア ${m[3]} で有効化する。`,
  },
  {
    re: /^ip ospf\s*(\d+) area\s*(\d+)$/i,
    explain: (m) => `このインターフェースをOSPFプロセス ${m[1]}・エリア ${m[2]} に参加させる（インターフェース単位の有効化）。`,
  },
  {
    re: /^ip ospf priority\s*(\d+)$/i,
    explain: (m) => `OSPFのDR/BDR選出プライオリティを ${m[1]} に設定する（大きいほどDRになりやすい。0はDR不参加）。`,
  },
  { re: /^router-id (\S+)$/i, explain: (m) => `ルーターIDを ${m[1]} に固定する（OSPF/BGP等のルータ識別子）。` },
  { re: /^passive-interface (\S+)$/i, explain: (m) => `${m[1]} からのルーティング更新送信を抑止する（受信は継続）。` },

  // --- その他ルーティング ---
  { re: /^router (eigrp|rip|bgp)\s*(\d+)?$/i, explain: (m) => `${m[1].toUpperCase()} を起動し、ルーティング設定モードに入る。` },
  { re: /^network (\S+)(\s+\S+)?$/i, explain: (m) => `${m[1]} をルーティングプロトコルの対象ネットワークとして宣言する。` },

  // --- VLAN ---
  { re: /^vlan\s*(\d+)$/i, explain: (m) => `VLAN ${m[1]} を作成し、VLAN設定モードに入る。` },
  { re: /^name (.+)$/i, explain: (m) => `VLANに名前「${m[1]}」を付ける（識別しやすくするため）。` },

  // --- 名前付き/番号付きACL ---
  {
    re: /^ip access-list standard (\S+)$/i,
    explain: (m) => `標準名前付きACL「${m[1]}」を作成する（送信元IPのみで許可/拒否）。`,
  },
  {
    re: /^ip access-list extended (\S+)$/i,
    explain: (m) => `拡張名前付きACL「${m[1]}」を作成する（送信元/宛先/プロトコル/ポートで制御）。`,
  },
  {
    re: /^access-list\s*(\d+) (permit|deny) (.+)$/i,
    explain: (m) => `番号付きACL ${m[1]} に「${m[2]} ${m[3]}」の条件を追加する。`,
  },
  {
    re: /^(permit|deny) (.+)$/i,
    explain: (m) => {
      const act = m[1].toLowerCase() === 'permit' ? '許可' : '拒否';
      return `ACLで「${m[2]}」に一致する通信を${act}する。`;
    },
  },
  { re: /^remark (.+)$/i, explain: (m) => `ACLに説明コメント「${m[1]}」を付ける。` },
  { re: /^ip access-group (\S+) (in|out)$/i, explain: (m) => `ACL「${m[1]}」をこのインターフェースの ${m[2]} 方向に適用する。` },
  { re: /^access-class (\S+) (in|out)$/i, explain: (m) => `ACL「${m[1]}」をVTY回線の ${m[2]} 方向に適用し、アクセス元を制限する。` },

  // --- DHCP ---
  { re: /^ip dhcp pool (\S+)$/i, explain: (m) => `DHCPプール「${m[1]}」を作成し、配布設定モードに入る。` },
  {
    re: /^ip dhcp excluded-address (\S+)(\s+(\S+))?$/i,
    explain: (m) => `DHCPで配布しないアドレス${m[3] ? `範囲 ${m[1]}〜${m[3]}` : ` ${m[1]}`}を除外する。`,
  },
  { re: /^default-router (\S+)$/i, explain: (m) => `DHCPクライアントに通知するデフォルトゲートウェイを ${m[1]} にする。` },
  { re: /^dns-server (\S+)$/i, explain: (m) => `DHCPクライアントに通知するDNSサーバを ${m[1]} にする。` },
  { re: /^ip helper-address (\S+)$/i, explain: (m) => `ブロードキャストのDHCP要求を ${m[1]} へユニキャスト転送する（リレー）。` },


  // --- 管理アクセス / 認証 ---
  { re: /^hostname (\S+)$/i, explain: (m) => `機器のホスト名を ${m[1]} に設定する（プロンプト表示に反映）。` },
  { re: /^line vty\s*(\d+)\s*(\d+)$/i, explain: (m) => `仮想端末回線 vty ${m[1]}〜${m[2]}（リモート接続用）の設定モードに入る。` },
  { re: /^line console\s*(\d+)$/i, explain: (m) => `コンソール回線 ${m[1]} の設定モードに入る。` },
  { re: /^login local$/i, explain: () => 'ログイン認証にローカルのユーザー名/パスワード(username)を使用する。' },
  { re: /^login$/i, explain: () => 'ログイン時のパスワード認証を有効化する（password で設定した値を使用）。' },
  { re: /^password (\S+)$/i, explain: (m) => `回線のパスワードを「${m[1]}」に設定する。` },
  {
    re: /^transport input (.+)$/i,
    explain: (m) => `この回線で許可するリモート接続方式を ${m[1]} に制限する。`,
  },
  { re: /^exec-timeout\s*(\d+)\s*(\d+)?$/i, explain: (m) => `無操作時の自動ログアウト時間を ${m[1]}分${m[2] ?? 0}秒に設定する。` },
  { re: /^logging synchronous$/i, explain: () => 'ログ出力で入力中のコマンドが乱れないよう同期表示する。' },
  {
    re: /^username (\S+)\b/i,
    explain: (m) => {
      const full = m[0];
      const priv = full.match(/privilege\s+(\d+)/i);
      const secret = /\bsecret\b/i.test(full);
      const algo = full.match(/algorithm-type\s+(\S+)/i);
      const kind = secret
        ? `パスワードを暗号化保存(secret${algo ? `・${algo[1]}` : ''})`
        : 'パスワードを設定(password)';
      return `ローカルユーザー「${m[1]}」を作成し、${priv ? `権限レベル${priv[1]}で` : ''}${kind}する。`;
    },
  },
  { re: /^enable secret (\S+)$/i, explain: (m) => `特権EXECモードのパスワードを「${m[1]}」に設定する（強い暗号化で保存）。` },
  { re: /^enable password (\S+)$/i, explain: (m) => `特権EXECモードのパスワードを「${m[1]}」に設定する（簡易暗号のみ）。` },
  {
    re: /^service password-encryption$/i,
    explain: () => 'running-config内の平文パスワードを簡易暗号化して表示する。',
  },
  { re: /^crypto key generate rsa\s*(\d+)?$/i, explain: (m) => `SSH用のRSA暗号鍵${m[1] ? `(${m[1]}ビット)` : ''}を生成する。` },
  { re: /^ip domain[- ]name (\S+)$/i, explain: (m) => `ドメイン名 ${m[1]} を設定する（RSA鍵生成・SSHに必要）。` },
  { re: /^no ip domain-lookup$/i, explain: () => '誤入力時のDNS名前解決を無効化し、待ち時間を防ぐ。' },
  { re: /^ip default-gateway (\S+)$/i, explain: (m) => `L2スイッチ等の管理用デフォルトゲートウェイを ${m[1]} に設定する。` },

  // --- 検出プロトコル ---
  { re: /^lldp run$/i, explain: () => 'LLDP（機器間の近隣検出プロトコル）をグローバルで有効化する。' },
  { re: /^no lldp run$/i, explain: () => 'LLDPをグローバルで無効化する。' },
  { re: /^cdp run$/i, explain: () => 'CDP（Cisco独自の近隣検出）をグローバルで有効化する。' },
  { re: /^no cdp run$/i, explain: () => 'CDPをグローバルで無効化する。' },
  { re: /^cdp enable$/i, explain: () => 'このインターフェースでCDPを有効化する。' },
  { re: /^no cdp enable$/i, explain: () => 'このインターフェースでCDPを無効化する。' },
  { re: /^lldp (transmit|receive)$/i, explain: (m) => `このインターフェースでLLDPの${m[1] === 'transmit' ? '送信' : '受信'}を有効化する。` },
  { re: /^no lldp (transmit|receive)$/i, explain: (m) => `このインターフェースでLLDPの${m[1] === 'transmit' ? '送信' : '受信'}を無効化する。` },

  // --- スパツリ ---
  { re: /^spanning-tree mode (\S+)$/i, explain: (m) => `スパニングツリーの動作モードを ${m[1]} に設定する。` },
  { re: /^spanning-tree vlan (.+) root (primary|secondary)$/i, explain: (m) => `VLAN ${m[1]} のルートブリッジを ${m[2]} として優先設定する。` },
  { re: /^spanning-tree portfast.*$/i, explain: () => 'アクセスポートを即座に転送状態にする(PortFast)。端末直結ポート向け。' },
  { re: /^spanning-tree bpduguard.*$/i, explain: () => 'PortFastポートでBPDU受信時にポートを遮断する(BPDU Guard)。' },

  // --- NTP / 時刻 ---
  { re: /^ntp server (\S+)$/i, explain: (m) => `時刻同期先のNTPサーバを ${m[1]} に指定する。` },
  { re: /^ntp master\s*(\d+)?$/i, explain: (m) => `自機をNTPマスター(基準時刻源)にする${m[1] ? `（stratum ${m[1]}）` : ''}。` },
  { re: /^clock set (.+)$/i, explain: (m) => `機器の時刻を「${m[1]}」に手動設定する。` },
];

/**
 * コマンド文字列から解説を生成する。マッチしなければ空文字列。
 */
export function explainCommand(raw: string): string {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return '';
  for (const rule of RULES) {
    const m = s.match(rule.re);
    if (m) {
      try {
        return rule.explain(m);
      } catch {
        return '';
      }
    }
  }
  return '';
}
