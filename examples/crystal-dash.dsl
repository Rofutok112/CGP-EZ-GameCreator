class Main
{
    GameObject player;
    GameObject goal;
    GameObject drone1;
    GameObject drone2;
    UIText hud;
    UIText help;
    UIText message;
    List<GameObject> platforms = new List<GameObject>();
    List<GameObject> coins = new List<GameObject>();
    List<GameObject> spikes = new List<GameObject>();
    int score = 0;
    int lives = 3;
    int totalCoins = 10;
    float speed = 4.5f;
    float jumpPower = -12.5f;
    float gravity = 0.65f;
    bool grounded = false;
    bool gameOver = false;
    float invincibleUntil = 0f;

    void Start()
    {
        player = Create.Box(80, 240, 30, 38);
        player.color = "#22d3ee";

        hud = Create.UIText("", 18, 24, 20);
        hud.color = "#111827";
        help = Create.UIText("A/D: move   Space: jump   collect crystals and reach the gate", 18, 52, 16);
        help.color = "#475569";
        message = Create.UIText("", 190, 170, 32);
        message.color = "#0f766e";

        AddPlatform(180, 339, 360, 42, "#334155");
        AddPlatform(505, 300, 190, 28, "#475569");
        AddPlatform(750, 260, 180, 28, "#475569");
        AddPlatform(1070, 324, 300, 36, "#334155");
        AddPlatform(1390, 276, 200, 28, "#475569");
        AddPlatform(1645, 234, 190, 28, "#475569");
        AddPlatform(1985, 320, 330, 40, "#334155");

        AddCoin(470, 246);
        AddCoin(720, 206);
        AddCoin(790, 206);
        AddCoin(980, 268);
        AddCoin(1090, 268);
        AddCoin(1350, 222);
        AddCoin(1440, 222);
        AddCoin(1610, 180);
        AddCoin(1690, 180);
        AddCoin(1970, 260);

        AddSpike(354, 305);
        AddSpike(624, 273);
        AddSpike(1239, 293);
        AddSpike(1774, 207);

        drone1 = Create.Box(690, 210, 30, 24);
        drone1.color = "#ef4444";
        drone1.vx = 1.8f;
        drone2 = Create.Box(1540, 180, 34, 24);
        drone2.color = "#f97316";
        drone2.vx = -2.2f;

        goal = Create.Box(2140, 246, 48, 72);
        goal.color = "#10b981";
        Camera.Follow(player);
        UpdateHud();
    }

    void Update()
    {
        if (!gameOver)
        {
            ControlPlayer();
            MoveDrone(drone1, 660, 900, 1.8f);
            MoveDrone(drone2, 1510, 1740, 2.2f);
            CheckPlatforms();
            CheckCoins();
            CheckDamage();
            CheckGoal();
            UpdateHud();
            Camera.Follow(player);
        }

        if (gameOver)
        {
            if (Input.GetKeyDown("R"))
            {
                Game.Reset();
            }
        }
    }

    void AddPlatform(float x, float y, float width, float height, string color)
    {
        GameObject platform = Create.Box(x, y, width, height);
        platform.color = color;
        platforms.Add(platform);
    }

    void AddCoin(float x, float y)
    {
        GameObject coin = Create.Circle(x, y, 11);
        coin.color = "#facc15";
        coins.Add(coin);
    }

    void AddSpike(float x, float y)
    {
        GameObject spike = Create.Box(x, y, 28, 26);
        spike.color = "#dc2626";
        spikes.Add(spike);
    }

    void ControlPlayer()
    {
        player.vx = 0;

        if (Input.GetKey("A"))
        {
            player.vx = -speed;
            player.flipX = true;
        }
        else if (Input.GetKey("D"))
        {
            player.vx = speed;
            player.flipX = false;
        }

        if (Input.GetKeyDown("Space") && grounded)
        {
            player.vy = jumpPower;
            grounded = false;
            Sound.Play("jump", 0.25f);
        }

        player.vy = player.vy + gravity;

        if (player.x < 20)
        {
            player.x = 20;
        }
    }

    void CheckPlatforms()
    {
        grounded = false;

        for (int i = 0; i < platforms.Count; i = i + 1)
        {
            if (player.Touch(platforms[i]) && player.vy >= 0)
            {
                if (player.y < platforms[i].y)
                {
                    player.y = platforms[i].y - platforms[i].height / 2 - player.height / 2;
                    player.vy = 0;
                    grounded = true;
                }
            }
        }
    }

    void CheckCoins()
    {
        for (int i = coins.Count - 1; i >= 0; i = i - 1)
        {
            if (player.Touch(coins[i]))
            {
                coins[i].Destroy();
                coins.Remove(coins[i]);
                score = score + 1;
                Sound.Play("coin", 0.35f);
            }
        }
    }

    void CheckDamage()
    {
        if (Time.time > invincibleUntil)
        {
            for (int i = 0; i < spikes.Count; i = i + 1)
            {
                if (player.Touch(spikes[i]))
                {
                    HurtPlayer();
                }
            }

            if (player.Touch(drone1) || player.Touch(drone2))
            {
                HurtPlayer();
            }

            if (player.y > 390)
            {
                HurtPlayer();
            }
        }
    }

    void HurtPlayer()
    {
        lives = lives - 1;
        invincibleUntil = Time.time + 1.2f;
        player.x = 80;
        player.y = 240;
        player.vx = 0;
        player.vy = 0;
        Sound.Play("hit", 0.45f);

        if (lives <= 0)
        {
            gameOver = true;
            message.value = "GAME OVER  Press R";
            message.color = "#dc2626";
            player.Hide();
        }
    }

    void CheckGoal()
    {
        if (player.Touch(goal) && score >= totalCoins)
        {
            gameOver = true;
            message.value = "CLEAR!  Press R";
            message.color = "#0f766e";
            player.vx = 0;
            player.vy = 0;
            Sound.Play("clear", 0.6f);
        }

        if (player.Touch(goal) && score < totalCoins)
        {
            help.value = "Crystals left: " + (totalCoins - score).ToString();
        }
    }

    void MoveDrone(GameObject drone, float left, float right, float pace)
    {
        if (drone.x < left)
        {
            drone.vx = pace;
        }

        if (drone.x > right)
        {
            drone.vx = -pace;
        }

        drone.flipX = drone.vx < 0;
    }

    void UpdateHud()
    {
        hud.value = "Crystals " + score.ToString() + "/" + totalCoins.ToString() + "   Life " + lives.ToString() + "   Time " + Math.Fixed(Time.time, 1);

        if (Time.time > invincibleUntil)
        {
            player.color = "#22d3ee";
        }
        else
        {
            player.color = "#f8fafc";
        }
    }
}
