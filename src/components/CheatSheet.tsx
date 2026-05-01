"use client";

import { FileText, Folder, X } from "lucide-react";
import { useState } from "react";

const groups = [
  {
    title: "型",
    items: [
      { name: "int", description: "整数を入れる型" },
      { name: "float", description: "小数を入れる型" },
      { name: "bool", description: "true / false を入れる型" },
      { name: "string", description: "文字を入れる型" },
      { name: "GameObject", description: "四角や円など、画面上の物体" },
      { name: "Text", description: "画面に固定表示される文字" },
      { name: "List<T>", description: "同じ型の値を複数持つ入れ物" }
    ]
  },
  {
    title: "作成",
    items: [
      { name: "Create.Box(x, y, width, height)", description: "四角形のGameObjectを作る" },
      { name: "Create.Circle(x, y, radius)", description: "円のGameObjectを作る" },
      { name: "Create.Sprite(name, x, y, width, height)", description: "assets内の画像を指定サイズのGameObjectとして作る。例: \"characters/player\"" },
      { name: "Create.Text(value, x, y, size)", description: "画面固定のTextを作る" }
    ]
  },
  {
    title: "GameObject",
    items: [
      { name: "x / y", description: "位置" },
      { name: "vx / vy", description: "1フレームごとの移動量" },
      { name: "width / height", description: "大きさ" },
      { name: "visible", description: "表示されているか" },
      { name: "color", description: "色" },
      { name: "flipX", description: "画像を左右反転する。trueで左向き/右向きを切り替えられる" },
      { name: "SetSprite(name)", description: "作成済みGameObjectの見た目をassets内の画像に差し替える。大きさは変わらない" },
      { name: "Touch(other)", description: "他の物体やTextに触れているか" },
      { name: "TouchWall()", description: "画面端に触れているか" },
      { name: "Hide()", description: "非表示にして当たり判定から外す" },
      { name: "Show()", description: "Hideしたものを戻す" },
      { name: "Move(x, y)", description: "指定位置に移動する" },
      { name: "Destroy()", description: "完全に消す" }
    ]
  },
  {
    title: "Text",
    items: [
      { name: "x / y", description: "画面上の固定位置" },
      { name: "value", description: "表示する文字" },
      { name: "size", description: "文字サイズ" },
      { name: "color", description: "文字色" },
      { name: "visible", description: "表示されているか" },
      { name: "Hide()", description: "非表示にする" },
      { name: "Show()", description: "表示に戻す" },
      { name: "Move(x, y)", description: "指定位置に移動する" },
      { name: "Destroy()", description: "完全に消す" }
    ]
  },
  {
    title: "List<T>",
    items: [
      { name: "Add(value)", description: "末尾に追加する" },
      { name: "Remove(value)", description: "指定した値を削除する" },
      { name: "Clear()", description: "全部消す" },
      { name: "Count", description: "入っている数" },
      { name: "list[index]", description: "番号で取り出す" }
    ]
  },
  {
    title: "入力/補助",
    items: [
      { name: "key.Down(\"A\")", description: "押している間true" },
      { name: "key.Pressed(\"Space\")", description: "押した瞬間だけtrue" },
      { name: "Time.time", description: "開始からの秒数" },
      { name: "Time.deltaTime", description: "前フレームからの秒数" },
      { name: "Time.frameCount", description: "現在のフレーム数" },
      { name: "Random.Range(min, max)", description: "範囲内の乱数" },
      { name: "Random.Chance(rate)", description: "指定確率でtrue。小数は 0.01f のように書く" }
    ]
  },
  {
    title: "Math",
    items: [
      { name: "1.0f / 0.25f", description: "Unity/C#風のfloatリテラル。小数を書くときは末尾に f が必要" },
      { name: "Math.Round(value, digits)", description: "数値を指定した小数桁に丸める" },
      { name: "Math.Fixed(value, digits)", description: "指定した小数桁で表示する文字列にする" },
      { name: "value.ToString(\"F2\")", description: "C#風に小数2桁の文字列へ変換する" },
      { name: "Math.Floor(value)", description: "小数を切り捨てる" },
      { name: "Math.Ceil(value)", description: "小数を切り上げる" }
    ]
  },
  {
    title: "ゲーム",
    items: [
      { name: "game.Reset()", description: "ゲームを最初からやり直す" },
      { name: "sound.Play(name, volume)", description: "assets内の音声を鳴らす。volumeは0fから1f。例: sound.Play(\"jump\", 0.5f)" },
      { name: "camera.Follow(obj)", description: "カメラが物体を追う" }
    ]
  }
];

export function CheatSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const [selectedTitle, setSelectedTitle] = useState(groups[0].title);
  const selectedGroup = groups.find((group) => group.title === selectedTitle) ?? groups[0];
  if (!open) return null;

  return (
    <div className="docs-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="docs-dialog" role="dialog" aria-modal="true" aria-label="APIドキュメント" onMouseDown={(event) => event.stopPropagation()}>
        <header className="docs-header">
          <div>
            <h2>APIドキュメント</h2>
            <p>左の構造から、使いたい機能を探します。</p>
          </div>
          <button onClick={onClose} aria-label="ドキュメントを閉じる">
            <X size={16} /> 閉じる
          </button>
        </header>
        <div className="docs-body">
          <nav className="docs-tree" aria-label="APIカテゴリ">
            <div className="docs-root">
              <Folder size={16} /> DSL API
            </div>
            {groups.map((group) => (
              <button className={group.title === selectedTitle ? "active" : ""} key={group.title} onClick={() => setSelectedTitle(group.title)}>
                <FileText size={15} />
                {group.title}.md
              </button>
            ))}
          </nav>
          <article className="docs-content">
            <h3>{selectedGroup.title}</h3>
            <table className="docs-table">
              <tbody>
                {selectedGroup.items.map((item) => (
                  <tr key={item.name}>
                    <th>
                      <code>{item.name}</code>
                    </th>
                    <td>{item.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </div>
      </section>
    </div>
  );
}
