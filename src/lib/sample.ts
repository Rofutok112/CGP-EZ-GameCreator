export const sampleCode = `class Main
{
    void Start()
    {
    }

    void Update()
    {
    }
}`;

export const snippets = [
  {
    title: "基本形",
    code: `class Main
{
    void Start()
    {
    }

    void Update()
    {
    }
}`
  },
  {
    title: "四角を作る",
    code: `GameObject block;

block = Create.Box(100, 100, 32, 32);
block.color = "green";`
  },
  {
    title: "文字を作る",
    code: `Text label;
label = Create.Text("Hello", 20, 20, 22);
label.color = "black";`
  },
  {
    title: "左右移動",
    code: `void MovePlayer(float moveSpeed)
{
    if (key.Down("A"))
    {
        player.vx = -moveSpeed;
    }
    else if (key.Down("D"))
    {
        player.vx = moveSpeed;
    }
    else
    {
        player.vx = 0;
    }
}`
  },
  {
    title: "関数を呼ぶ",
    code: `MovePlayer(speed);`
  },
  {
    title: "後ろから削除",
    code: `for (int i = enemies.Count - 1; i >= 0; i = i - 1)
{
    if (player.Touch(enemies[i]))
    {
        enemies[i].Destroy();
        enemies.Remove(enemies[i]);
    }
}`
  },
  {
    title: "乱数で出す",
    code: `if (Random.Chance(0.01f))
{
    GameObject enemy = Create.Box(620, Random.Range(80, 230), 28, 28);
    enemies.Add(enemy);
}`
  }
];
