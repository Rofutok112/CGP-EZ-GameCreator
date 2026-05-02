# CGP EZ GameCreator

C#風DSLで小さな2Dゲームを作るための、LAN内完結型Webアプリです。新歓や短時間の体験授業で、コードを書いてすぐ動かし、先生が生徒の作業状況をリアルタイムに確認できることを重視しています。

## 主な機能

- CodeMirror 6 ベースの本格エディタ
- C# / Unity に寄せた `class Main`, `Start()`, `Update()` 構成
- 日本語の静的解析エラーと実行時エラー
- Start / Pause / Stop 付きのゲームプレビュー
- 図形、画像、テキスト、音声、当たり判定、カメラ追従
- 生徒別 `assets/` 管理とプレビュー
- 先生画面で生徒のコードをリアルタイム確認
- 先生側でもコード確認、診断、再実行プレビュー

## 起動

```bash
npm install
npm run start
```

生徒画面:

```text
http://localhost:3000
```

先生画面:

```text
http://localhost:3000/teacher
```

同じLAN内の別端末からアクセスする場合は、サーバーPCのIPアドレスを使います。

```text
http://<サーバーPCのIPアドレス>:3000
```

## GitHub Pages 体験版

GitHub Pages ではサーバーAPIを使えないため、静的ページとして動く範囲だけを公開します。

- 使えるもの: エディタ、静的解析、ゲームプレビュー、ドキュメント、ブラウザ内保存
- 使えないもの: 先生画面、リアルタイム同期、SQLite、画面からのファイル追加/削除

静的書き出しは次のコマンドで確認できます。

```bash
npm run build:pages
```

`main` に push すると GitHub Actions が `out/` を GitHub Pages にデプロイします。

## 授業での使い方

1. 先生PCで `npm run dev` を起動します。
2. 生徒に `http://<先生PCのIPアドレス>:3000` を案内します。
3. 生徒は画面下部の「リアルタイム共有」で授業ID、名前、作品名を入力します。
4. 先生は `/teacher` で同じ授業IDを指定して、生徒一覧を確認します。
5. 各カードの「開く」から、生徒ごとのコードとプレビューを確認できます。

先生トークンの初期値は `teacher` です。

## DSLの基本形

```csharp
class Main
{
    GameObject player;

    void Start()
    {
        player = Create.Box(100, 160, 36, 36);
        player.color = "blue";
    }

    void Update()
    {
        if (key.Down("A"))
        {
            player.vx = -4;
        }
        else if (key.Down("D"))
        {
            player.vx = 4;
        }
        else
        {
            player.vx = 0;
        }
    }
}
```

`GameObject` と `Text` は作成後に自動描画されます。不要になったら `Destroy()` で削除できます。

## 画像素材

生徒ごとに `public/assets/<clientId>/` が割り当てられます。画面上の「ファイル」から画像や音声を追加できます。

画像を最初から持つオブジェクトを作る場合:

```csharp
player = Create.Sprite("sprites/player", 100, 160, 36, 36);
```

あとから見た目だけ差し替える場合:

```csharp
player = Create.Box(100, 160, 36, 36);
player.SetSprite("sprites/player");
player.flipX = true;
```

`Create.Sprite` も `SetSprite` も、当たり判定や表示サイズは画像サイズではなく `GameObject` の `width` / `height` を基準にします。

音声を鳴らす場合:

```csharp
sound.Play("sounds/jump");
sound.Play("coin.wav", 0.5f);
```

2つ目の引数で音量を `0.0f` から `1.0f` の範囲で指定できます。省略した場合は標準音量で鳴ります。拡張子を省略した場合は、`mp3`, `wav`, `ogg`, `m4a` の順に探します。生徒ごとの `assets/` が優先され、その後に共通の `public/assets/` を探します。

## よく使うAPI

```csharp
Create.Box(x, y, width, height)
Create.Circle(x, y, radius)
Create.Sprite(name, x, y, width, height)
Create.Text(value, x, y, size)

obj.x
obj.y
obj.vx
obj.vy
obj.width
obj.height
obj.visible
obj.color
obj.flipX

obj.SetSprite(name)
obj.Touch(other)
obj.TouchWall()
obj.Hide()
obj.Show()
obj.Move(x, y)
obj.Destroy()

key.Down("A")
key.Pressed("Space")

Time.time
Time.deltaTime
Time.frameCount

Random.Range(min, max)
Random.Chance(rate)

sound.Play(name)
sound.Play(name, volume)

Math.Round(value, digits)
Math.Fixed(value, digits)
Math.Floor(value)
Math.Ceil(value)
```

小数リテラルはC# / Unityに寄せて `1.0f` や `0.25f` のように末尾に `f` を付けます。`float speed = 5;` のように整数を `float` に入れることはできます。

## データ

- リアルタイム共有データは SQLite に保存されます。
- ローカルのDBや授業中アップロード素材は Git 管理しません。
- 空の素材置き場として `public/assets/.gitkeep` だけを含めています。

## 検証

```bash
npx tsc --noEmit
npm test
npm run build
npm run build:pages
```
