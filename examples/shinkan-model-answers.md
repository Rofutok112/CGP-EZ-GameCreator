# 新歓課題 模範解答

新歓ワークショップ用の段階別サンプルです。  
最初から全部見せるより、詰まった人にその課題だけ渡すくらいが使いやすいです。

## 課題1: 四角を左右に動かす

```csharp
class MoveBox
{
    GameObject player;
    float speed = 5.0f;

    void Start()
    {
        player = Create.Box(100, 160, 36, 36);
        player.color = "blue";
    }

    void Update()
    {
        if (Input.GetKey("A"))
        {
            player.vx = -speed;
        }
        else if (Input.GetKey("D"))
        {
            player.vx = speed;
        }
        else
        {
            player.vx = 0.0f;
        }
    }
}
```

## 課題2: 画面外に出ないようにする

```csharp
class KeepInside
{
    GameObject player;
    float speed = 5.0f;

    void Start()
    {
        player = Create.Box(100, 160, 36, 36);
        player.color = "blue";
    }

    void Update()
    {
        if (Input.GetKey("A"))
        {
            player.vx = -speed;
        }
        else if (Input.GetKey("D"))
        {
            player.vx = speed;
        }
        else
        {
            player.vx = 0.0f;
        }

        if (player.x < 18.0f)
        {
            player.x = 18.0f;
        }

        if (player.x > 622.0f)
        {
            player.x = 622.0f;
        }
    }
}
```

## 課題3: コインを1つ取る

```csharp
class OneCoin
{
    GameObject player;
    GameObject coin;
    float speed = 5.0f;

    void Start()
    {
        player = Create.Box(100, 160, 36, 36);
        player.color = "blue";

        coin = Create.Circle(300, 160, 12);
        coin.color = "yellow";
    }

    void Update()
    {
        MovePlayer();

        if (player.Touch(coin))
        {
            coin.Destroy();
        }
    }

    void MovePlayer()
    {
        if (Input.GetKey("A"))
        {
            player.vx = -speed;
        }
        else if (Input.GetKey("D"))
        {
            player.vx = speed;
        }
        else
        {
            player.vx = 0.0f;
        }
    }
}
```

## 課題4: スコアを表示する

```csharp
class ScoreCoin
{
    GameObject player;
    GameObject coin;
    UIText scoreText;
    int score = 0;
    float speed = 5.0f;

    void Start()
    {
        player = Create.Box(100, 160, 36, 36);
        player.color = "blue";

        coin = Create.Circle(300, 160, 12);
        coin.color = "yellow";

        scoreText = Create.UIText("Score: 0", 20, 20, 24);
        scoreText.color = "black";
    }

    void Update()
    {
        MovePlayer();

        if (player.Touch(coin))
        {
            coin.Destroy();
            score++;
        }

        scoreText.value = "Score: " + score;
    }

    void MovePlayer()
    {
        if (Input.GetKey("A"))
        {
            player.vx = -speed;
        }
        else if (Input.GetKey("D"))
        {
            player.vx = speed;
        }
        else
        {
            player.vx = 0.0f;
        }
    }
}
```

## 課題5: コインを複数置く

```csharp
class ManyCoins
{
    GameObject player;
    UIText scoreText;
    int score = 0;
    float speed = 5.0f;
    List<GameObject> coins = new List<GameObject>();

    void Start()
    {
        player = Create.Box(100, 160, 36, 36);
        player.color = "blue";

        scoreText = Create.UIText("Score: 0", 20, 20, 24);
        scoreText.color = "black";

        AddCoin(260, 160);
        AddCoin(360, 120);
        AddCoin(460, 200);
    }

    void Update()
    {
        MovePlayer();

        for (int i = coins.Count - 1; i >= 0; i--)
        {
            if (player.Touch(coins[i]))
            {
                coins[i].Destroy();
                coins.Remove(coins[i]);
                score++;
            }
        }

        scoreText.value = "Score: " + score;
    }

    void AddCoin(float x, float y)
    {
        GameObject coin = Create.Circle(x, y, 12);
        coin.color = "yellow";
        coins.Add(coin);
    }

    void MovePlayer()
    {
        if (Input.GetKey("A"))
        {
            player.vx = -speed;
        }
        else if (Input.GetKey("D"))
        {
            player.vx = speed;
        }
        else
        {
            player.vx = 0.0f;
        }
    }
}
```

## 課題6: 敵を動かす

```csharp
class MovingEnemy
{
    GameObject player;
    GameObject enemy;
    float speed = 5.0f;

    void Start()
    {
        player = Create.Box(100, 160, 36, 36);
        player.color = "blue";

        enemy = Create.Box(500, 160, 32, 32);
        enemy.color = "red";
        enemy.vx = -2.0f;
    }

    void Update()
    {
        MovePlayer();

        if (enemy.TouchWall())
        {
            enemy.vx *= -1.0f;
        }
    }

    void MovePlayer()
    {
        if (Input.GetKey("A"))
        {
            player.vx = -speed;
        }
        else if (Input.GetKey("D"))
        {
            player.vx = speed;
        }
        else
        {
            player.vx = 0.0f;
        }
    }
}
```

## 課題7: 敵に当たったらリセット

```csharp
class AvoidEnemy
{
    GameObject player;
    GameObject enemy;
    UIText scoreText;
    int score = 0;
    float speed = 5.0f;
    List<GameObject> coins = new List<GameObject>();

    void Start()
    {
        player = Create.Box(100, 160, 36, 36);
        player.color = "blue";

        enemy = Create.Box(520, 160, 32, 32);
        enemy.color = "red";
        enemy.vx = -2.0f;

        scoreText = Create.UIText("Score: 0", 20, 20, 24);
        scoreText.color = "black";

        AddCoin(260, 160);
        AddCoin(360, 120);
        AddCoin(460, 200);
    }

    void Update()
    {
        MovePlayer();
        MoveEnemy();
        CheckCoins();

        if (player.Touch(enemy))
        {
            Game.Reset();
        }

        scoreText.value = "Score: " + score;
    }

    void MovePlayer()
    {
        if (Input.GetKey("A"))
        {
            player.vx = -speed;
        }
        else if (Input.GetKey("D"))
        {
            player.vx = speed;
        }
        else
        {
            player.vx = 0.0f;
        }
    }

    void MoveEnemy()
    {
        if (enemy.TouchWall())
        {
            enemy.vx *= -1.0f;
        }
    }

    void CheckCoins()
    {
        for (int i = coins.Count - 1; i >= 0; i--)
        {
            if (player.Touch(coins[i]))
            {
                coins[i].Destroy();
                coins.Remove(coins[i]);
                score++;
            }
        }
    }

    void AddCoin(float x, float y)
    {
        GameObject coin = Create.Circle(x, y, 12);
        coin.color = "yellow";
        coins.Add(coin);
    }
}
```

## 発展: 文字を1文字ずつ集める

`string.Length` と `text[i]` の例です。

```csharp
class LetterGame
{
    UIText label;
    string word = "GAME";
    string shown = "";

    void Start()
    {
        label = Create.UIText("", 20, 20, 28);

        for (int i = 0; i < word.Length; i++)
        {
            shown = shown + word[i] + " ";
        }

        label.value = shown;
    }

    void Update()
    {
    }
}
```
