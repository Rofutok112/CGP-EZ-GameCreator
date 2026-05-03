"use client";

import { FileText, Folder, X } from "lucide-react";
import { useState } from "react";
import { highlightDslLine } from "@/lib/highlight";

const groups = [
  {
    title: "型",
    items: [
      { name: "int", description: "整数を入れる型", example: "int score = 0;" },
      { name: "float", description: "小数を入れる型", example: "float speed = 5.0f;" },
      { name: "bool", description: "true / false を入れる型", example: "bool isClear = false;" },
      { name: "string", description: "文字を入れる型", example: "string label = \"Score\";\nstring first = label[0];" },
      { name: "GameObject", description: "四角や円など、画面上の物体", example: "GameObject player;\nplayer = Create.Box(100, 160, 36, 36);" },
      { name: "UIText", description: "画面に固定表示される文字", example: "UIText scoreText;\nscoreText = Create.UIText(\"Score: 0\", 20, 20, 24);" },
      { name: "UIBox / UICircle", description: "画面に固定表示される図形", example: "UIBox panel = Create.UIBox(20, 20, 240, 100);\nUICircle icon = Create.UICircle(32, 32, 12);" },
      { name: "UIButton", description: "画面に固定表示されるボタン", example: "UIButton retry = Create.UIButton(\"Retry\", 520, 20, 96, 36);" },
      { name: "List<T>", description: "同じ型の値を複数持つ入れ物", example: "List<GameObject> enemies = new List<GameObject>();\nenemies.Add(Create.Box(500, 160, 32, 32));" }
    ]
  },
  {
    title: "作成",
    items: [
      { name: "Create.Box(x, y, width, height)", description: "x/yは中心", example: "GameObject block = Create.Box(100, 160, 36, 36);\nblock.color = \"blue\";" },
      { name: "Create.Circle(x, y, radius)", description: "x/yは中心", example: "GameObject coin = Create.Circle(300, 160, 12);\ncoin.color = \"yellow\";" },
      { name: "Create.Sprite(name, x, y, width, height)", description: "x/yは中心。サイズは画像ではなくwidth/height基準", example: "GameObject player = Create.Sprite(\"player.png\", 100, 160, 48, 48);" },
      { name: "Create.UIText(value, x, y, size)", description: "画面固定。x/yは左上", example: "UIText label = Create.UIText(\"Ready\", 20, 20, 24);" },
      { name: "Create.UIBox(x, y, width, height)", description: "画面固定の四角。x/yは左上", example: "UIBox panel = Create.UIBox(20, 20, 240, 120);" },
      { name: "Create.UICircle(x, y, radius)", description: "画面固定の円。x/yは左上", example: "UICircle icon = Create.UICircle(24, 24, 12);" },
      { name: "Create.UIButton(text, x, y, width, height)", description: "画面固定のボタン。x/yは左上", example: "UIButton start = Create.UIButton(\"Start\", 260, 180, 120, 40);" }
    ]
  },
  {
    title: "GameObject",
    items: [
      { name: "x / y", description: "中心座標", example: "player.x = player.x + 5.0f;\nplayer.y = 160.0f;" },
      { name: "vx / vy", description: "1フレームごとの移動量", example: "player.vx = 4.0f;\nplayer.vy = 0.0f;" },
      { name: "width / height", description: "大きさ", example: "player.width = 48.0f;\nplayer.height = 48.0f;" },
      { name: "visible", description: "表示されているか", example: "if (!coin.visible)\n{\n    coin.Show();\n}" },
      { name: "color", description: "色", example: "player.color = \"blue\";" },
      { name: "flipX", description: "画像を左右反転する。trueで左向き/右向きを切り替えられる", example: "player.flipX = true;" },
      { name: "SetSprite(name)", description: "作成済みGameObjectの見た目をassets内の画像に差し替える。大きさは変わらない", example: "player.SetSprite(\"player_run.png\");" },
      { name: "Touch(other)", description: "他の物体やUIに触れているか", example: "if (player.Touch(coin))\n{\n    coin.Destroy();\n}" },
      { name: "TouchWall()", description: "画面端に触れているか", example: "if (enemy.TouchWall())\n{\n    enemy.vx = -enemy.vx;\n}" },
      { name: "Hide()", description: "非表示にして当たり判定から外す", example: "coin.Hide();" },
      { name: "Show()", description: "Hideしたものを戻す", example: "coin.Show();" },
      { name: "Move(x, y)", description: "指定位置に移動する", example: "player.Move(100, 160);" },
      { name: "Destroy()", description: "完全に消す", example: "enemy.Destroy();" }
    ]
  },
  {
    title: "UI",
    items: [
      { name: "x / y", description: "左上座標", example: "scoreText.x = 20.0f;\nscoreText.y = 20.0f;" },
      { name: "value", description: "UIText / UIButton の表示文字", example: "scoreText.value = \"Score: \" + score;" },
      { name: "size", description: "UIText / UIButton の文字サイズ", example: "scoreText.size = 28.0f;" },
      { name: "color", description: "文字色または図形色", example: "panel.color = \"black\";" },
      { name: "textColor", description: "UIButton の文字色", example: "startButton.textColor = \"white\";" },
      { name: "Clicked()", description: "UIButton がクリックされた瞬間", example: "if (startButton.Clicked())\n{\n    Game.Reset();\n}" },
      { name: "Down()", description: "UIButton が押されている間", example: "if (startButton.Down())\n{\n    startButton.color = \"green\";\n}" },
      { name: "visible", description: "表示されているか", example: "scoreText.visible = true;" },
      { name: "Hide()", description: "非表示にする", example: "message.Hide();" },
      { name: "Show()", description: "表示に戻す", example: "message.Show();" },
      { name: "Move(x, y)", description: "指定位置に移動する", example: "scoreText.Move(20, 20);" },
      { name: "Destroy()", description: "完全に消す", example: "message.Destroy();" }
    ]
  },
  {
    title: "List<T>",
    items: [
      { name: "Add(value)", description: "末尾に追加する", example: "enemies.Add(Create.Box(500, 160, 32, 32));" },
      { name: "Remove(value)", description: "指定した値を削除する", example: "enemies[i].Destroy();\nenemies.Remove(enemies[i]);" },
      { name: "Clear()", description: "全部消す", example: "enemies.Clear();" },
      { name: "Count", description: "入っている数", example: "for (int i = 0; i < enemies.Count; i = i + 1)\n{\n    enemies[i].vx = -2.0f;\n}" },
      { name: "list[index]", description: "番号で取り出す", example: "GameObject enemy = enemies[0];" }
    ]
  },
  {
    title: "関数",
    items: [
      { name: "void Func()", description: "処理をまとめる。値は返さない", example: "void MovePlayer()\n{\n    player.x = player.x + 5.0f;\n}" },
      { name: "int / float / bool / string Func()", description: "計算結果を返す", example: "int Add(int a, int b)\n{\n    return a + b;\n}" },
      { name: "GameObject / UI / List<T> Func()", description: "オブジェクトやリストも返せる", example: "GameObject MakeEnemy()\n{\n    return Create.Box(500, 160, 32, 32);\n}" },
      { name: "return", description: "関数の結果を返す。voidでは return; のみ", example: "bool IsRightSide(GameObject obj)\n{\n    return obj.x > 320.0f;\n}" }
    ]
  },
  {
    title: "string",
    items: [
      { name: "Length", description: "文字数", example: "string text = \"hello\";\nint count = text.Length;" },
      { name: "text[index]", description: "番号で1文字を取り出す。結果は1文字のstring", example: "string text = \"hello\";\nstring first = text[0];" },
      { name: "forで1文字ずつ読む", description: "Length と [] を組み合わせる", example: "string text = \"hello\";\nfor (int i = 0; i < text.Length; i++)\n{\n    string ch = text[i];\n}" },
      { name: "foreachで1文字ずつ読む", description: "文字列を前から順に読む", example: "string text = \"hello\";\nforeach (string ch in text)\n{\n    // ch に1文字ずつ入る\n}" }
    ]
  },
  {
    title: "入力/補助",
    items: [
      { name: "Input.GetKey(\"A\")", description: "押している間true", example: "if (Input.GetKey(\"A\"))\n{\n    player.vx = -5.0f;\n}" },
      { name: "Input.GetKeyDown(\"Space\")", description: "押した瞬間だけtrue", example: "if (Input.GetKeyDown(\"Space\"))\n{\n    Sound.Play(\"jump\", 0.6f);\n}" },
      { name: "Input.mouseX / Input.mouseY", description: "マウスの画面座標", example: "cursor.Move(Input.mouseX, Input.mouseY);" },
      { name: "Time.time", description: "開始からの秒数", example: "timerText.value = Math.Fixed(Time.time, 1);" },
      { name: "Time.deltaTime", description: "前フレームからの秒数", example: "enemy.x = enemy.x + 120.0f * Time.deltaTime;" },
      { name: "Time.frameCount", description: "現在のフレーム数", example: "if (Time.frameCount % 60 == 0)\n{\n    score = score + 1;\n}" },
      { name: "Random.Range(min, max)", description: "範囲内の乱数", example: "float y = Random.Range(80.0f, 220.0f);" },
      { name: "Random.Chance(rate)", description: "指定確率でtrue。小数は 0.01f のように書く", example: "if (Random.Chance(0.01f))\n{\n    enemies.Add(Create.Box(620, 160, 32, 32));\n}" }
    ]
  },
  {
    title: "Math",
    items: [
      { name: "i++ / i--", description: "数値を1増やす/1減らす", example: "for (int i = 0; i < 10; i++)\n{\n    score++;\n}" },
      { name: "1.0f / 0.25f", description: "Unity/C#風のfloatリテラル。小数を書くときは末尾に f が必要", example: "float speed = 5.0f;\nfloat rate = 0.25f;" },
      { name: "Math.Round(value, digits)", description: "数値を指定した小数桁に丸める", example: "float rounded = Math.Round(Time.time, 2);" },
      { name: "Math.Fixed(value, digits)", description: "指定した小数桁で表示する文字列にする", example: "timerText.value = Math.Fixed(Time.time, 2);" },
      { name: "value.ToString(\"F2\")", description: "C#風に小数2桁の文字列へ変換する", example: "timerText.value = Time.time.ToString(\"F2\");" },
      { name: "Math.Floor(value)", description: "小数を切り捨てる", example: "int seconds = Math.Floor(Time.time);" },
      { name: "Math.Ceil(value)", description: "小数を切り上げる", example: "int rest = Math.Ceil(10.0f - Time.time);" }
    ]
  },
  {
    title: "ゲーム",
    items: [
      { name: "Game.Reset()", description: "ゲームを最初からやり直す", example: "if (player.Touch(enemy))\n{\n    Game.Reset();\n}" },
      { name: "Sound.Play(name, volume)", description: "assets内の音声を鳴らす。volumeは0fから1f。例: Sound.Play(\"jump\", 0.5f)", example: "Sound.Play(\"coin\", 0.8f);" },
      { name: "Camera.Follow(obj)", description: "カメラが物体を追う", example: "Camera.Follow(player);" }
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
            <p>API Reference</p>
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
                    <td>
                      <p>{item.description}</p>
                      {"example" in item ? (
                        <details className="docs-example">
                          <summary>使用例</summary>
                          <HighlightedExample code={item.example} />
                        </details>
                      ) : null}
                    </td>
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

function HighlightedExample({ code }: { code: string }) {
  return (
    <pre className="docs-example-code">
      {code.split(/\r?\n/).map((line, lineIndex) => (
        <span className="code-line" key={lineIndex}>
          {highlightDslLine(line).map((token, tokenIndex) => (
            <span className={token.className || undefined} key={tokenIndex}>
              {token.text}
            </span>
          ))}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}
