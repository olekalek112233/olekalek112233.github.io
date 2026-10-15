-- PaperCraft 2D - PaperOS Lua v1.3
-- Sterowanie: A/D lub strzalki = ruch, W/SPACE = skok
-- J = zniszcz blok przed graczem, K = postaw blok
-- 1-4 = wybor bloku, S = zapis, L = wczytanie, R = nowy swiat
-- Uruchom w aplikacji Lua PaperOS z aktywnym canvasem.

local SW, SH = disp.w(), disp.h()
local TILE = 10
local WORLD_W, WORLD_H = 64, 24
local SAVE_KEY = "papercraft2d_world_v1"

local C = {
  sky = disp.rgb(105, 185, 235),
  dirt = disp.rgb(130, 82, 48),
  grass = disp.rgb(75, 175, 65),
  stone = disp.rgb(115, 120, 130),
  wood = disp.rgb(150, 100, 48),
  leaves = disp.rgb(45, 145, 55),
  sand = disp.rgb(220, 200, 120),
  water = disp.rgb(45, 115, 220),
  white = disp.rgb(255, 255, 255),
  dark = disp.rgb(25, 30, 38),
  skin = disp.rgb(245, 190, 140),
  blue = disp.rgb(55, 90, 220)
}

local BLOCK = { AIR=0, GRASS=1, DIRT=2, STONE=3, WOOD=4, LEAVES=5, SAND=6, WATER=7 }
local blockColor = { [1]=C.grass, [2]=C.dirt, [3]=C.stone, [4]=C.wood, [5]=C.leaves, [6]=C.sand, [7]=C.water }
local blockName = { [1]="TRAWA", [2]="ZIEMIA", [3]="KAMIEN", [4]="DREWNO", [5]="LISCIE", [6]="PIASEK", [7]="WODA" }

local world = {}
local px, py, vx, vy = 8, 5, 0, 0
local facing = 1
local selected = 1
local camX, camY = 0, 0
local message, messageUntil = "Witaj w PaperCraft 2D!", 0
local frame = 0

local function inside(x,y)
  return x >= 1 and x <= WORLD_W and y >= 1 and y <= WORLD_H
end

local function getBlock(x,y)
  if x < 1 or x > WORLD_W or y > WORLD_H then return BLOCK.STONE end
  if y < 1 then return BLOCK.AIR end
  return world[y][x] or BLOCK.AIR
end

local function setBlock(x,y,b)
  if inside(x,y) then world[y][x] = b end
end

local function say(s)
  message = s
  messageUntil = os.millis() + 1800
end

local function newWorld()
  world = {}
  for y=1,WORLD_H do
    world[y] = {}
    for x=1,WORLD_W do
      local surface = 13 + math.floor(math.sin(x * 0.31) * 2) + math.floor(math.sin(x * 0.13) * 2)
      local b = BLOCK.AIR
      if y == surface then b = BLOCK.GRASS
      elseif y > surface and y < surface + 4 then b = BLOCK.DIRT
      elseif y >= surface + 4 then b = BLOCK.STONE end
      if y == surface and (x % 17 == 4 or x % 23 == 8) then b = BLOCK.SAND end
      world[y][x] = b
    end
  end
  -- Male drzewka
  for x=5,WORLD_W-3,11 do
    local ground = 13 + math.floor(math.sin(x * 0.31) * 2) + math.floor(math.sin(x * 0.13) * 2)
    if getBlock(x,ground) == BLOCK.GRASS then
      for yy=ground-3,ground-1 do setBlock(x,yy,BLOCK.WOOD) end
      setBlock(x-1,ground-3,BLOCK.LEAVES)
      setBlock(x+1,ground-3,BLOCK.LEAVES)
      setBlock(x,ground-4,BLOCK.LEAVES)
      setBlock(x-1,ground-2,BLOCK.LEAVES)
      setBlock(x+1,ground-2,BLOCK.LEAVES)
    end
  end
  px, py, vx, vy, facing = 8, 7, 0, 0, 1
  say("Nowy swiat wygenerowany")
end

local function saveWorld()
  local out = { "PC2", tostring(WORLD_W), tostring(WORLD_H), tostring(math.floor(px*10)/10), tostring(math.floor(py*10)/10), tostring(selected) }
  for y=1,WORLD_H do
    local row = {}
    for x=1,WORLD_W do row[x] = string.char(48 + (world[y][x] or 0)) end
    out[#out+1] = table.concat(row)
  end
  local data = table.concat(out, "\n")
  local ok = pcall(store.set, SAVE_KEY, data)
  if ok then say("Swiat zapisany!") else say("Blad zapisu") end
end

local function loadWorld()
  local data = store.get(SAVE_KEY, "")
  if data == "" then say("Brak zapisu - nacisnij S") return end
  local lines = {}
  for line in string.gmatch(data, "[^\n]+") do lines[#lines+1] = line end
  if lines[1] ~= "PC2" or tonumber(lines[2]) ~= WORLD_W or tonumber(lines[3]) ~= WORLD_H or #lines < WORLD_H+6 then
    say("Zapis ma zly format")
    return
  end
  local nx, ny = {}, {}
  for y=1,WORLD_H do
    local row = lines[y+6]
    if not row or #row < WORLD_W then say("Uszkodzony zapis") return end
    nx[y] = {}
    for x=1,WORLD_W do nx[y][x] = string.byte(row,x)-48 end
  end
  world = nx
  px = tonumber(lines[4]) or 8
  py = tonumber(lines[5]) or 7
  selected = math.max(1, math.min(7, tonumber(lines[6]) or 1))
  vx, vy = 0, 0
  say("Zapis wczytany!")
end

newWorld()

local function solidAt(x,y)
  local b = getBlock(math.floor(x), math.floor(y))
  return b ~= BLOCK.AIR and b ~= BLOCK.WATER
end

local function playerBlocked(x,y)
  return solidAt(x,y) or solidAt(x+0.65,y) or solidAt(x,y+0.9) or solidAt(x+0.65,y+0.9)
end

local function interactBreak()
  local tx = math.floor(px + (facing > 0 and 1.2 or -0.35))
  local ty = math.floor(py + 0.45)
  local b = getBlock(tx,ty)
  if b ~= BLOCK.AIR and b ~= BLOCK.STONE then
    setBlock(tx,ty,BLOCK.AIR)
    say("Blok zniszczony")
  elseif b == BLOCK.STONE then
    setBlock(tx,ty,BLOCK.AIR)
    say("Wykopano kamien")
  end
end

local function interactPlace()
  local tx = math.floor(px + (facing > 0 and 1.2 or -0.35))
  local ty = math.floor(py + 0.45)
  if getBlock(tx,ty) == BLOCK.AIR and not (tx >= px and tx <= px+0.65 and ty >= py and ty <= py+0.9) then
    setBlock(tx,ty,selected)
  end
end

local function drawBlock(x,y,b)
  if b == BLOCK.AIR then return end
  local sx = (x-1)*TILE - camX
  local sy = (y-1)*TILE - camY
  if sx < -TILE or sx > SW or sy < -TILE or sy > SH then return end
  disp.fillRect(sx,sy,TILE,TILE,blockColor[b] or C.stone)
  disp.rect(sx,sy,TILE,TILE,disp.rgb(30,45,45))
  if b == BLOCK.GRASS then disp.fillRect(sx,sy,TILE,2,disp.rgb(120,220,75)) end
  if b == BLOCK.STONE then
    disp.pixel(sx+3,sy+3,disp.rgb(155,160,170))
    disp.pixel(sx+7,sy+6,disp.rgb(85,90,100))
  elseif b == BLOCK.WOOD then
    disp.line(sx+3,sy+1,sx+3,sy+8,disp.rgb(105,65,30))
  elseif b == BLOCK.LEAVES then
    disp.pixel(sx+3,sy+3,disp.rgb(90,190,65))
  elseif b == BLOCK.WATER then
    disp.line(sx+1,sy+3,sx+7,sy+3,disp.rgb(100,180,255))
  end
end

local function draw()
  disp.clear(C.sky)
  -- chmurki
  disp.fillCircle(28-camX*0.15,18,7,disp.rgb(225,245,255))
  disp.fillCircle(37-camX*0.15,16,9,disp.rgb(225,245,255))
  disp.fillCircle(47-camX*0.15,19,6,disp.rgb(225,245,255))

  local minX = math.max(1, math.floor(camX/TILE)+1)
  local maxX = math.min(WORLD_W, math.floor((camX+SW)/TILE)+2)
  local minY = math.max(1, math.floor(camY/TILE)+1)
  local maxY = math.min(WORLD_H, math.floor((camY+SH)/TILE)+2)
  for y=minY,maxY do
    for x=minX,maxX do drawBlock(x,y,getBlock(x,y)) end
  end

  -- gracz
  local sx, sy = math.floor((px-1)*TILE-camX), math.floor((py-1)*TILE-camY)
  disp.fillRect(sx+2,sy+2,6,4,C.skin)
  disp.fillRect(sx+1,sy+6,8,8,C.blue)
  disp.fillRect(sx+1,sy+13,3,5,C.dark)
  disp.fillRect(sx+6,sy+13,3,5,C.dark)
  disp.pixel(sx+(facing>0 and 6 or 3),sy+3,C.dark)

  -- pasek interfejsu
  disp.fillRect(0,0,SW,16,disp.rgb(20,30,38))
  disp.text(3,3,"PAPERCRAFT 2D",C.white)
  disp.text(148,3,"X:"..math.floor(px).." Y:"..math.floor(py),C.white)
  disp.fillRect(2,SH-19,SW-4,17,disp.rgb(20,30,38))
  for i=1,7 do
    local x=4+(i-1)*17
    disp.rect(x,SH-17,15,13,i==selected and C.white or disp.rgb(90,100,110))
    if i <= 7 then disp.fillRect(x+4,SH-13,7,6,blockColor[i]) end
  end
  disp.text(128,SH-15,blockName[selected] or "BLOK",C.white)
  if os.millis() < messageUntil then
    disp.fillRect(28,20,184,13,disp.rgb(20,30,38))
    disp.text(33,22,message,C.white)
  end
  disp.flip()
end

local function update()
  frame = frame + 1
  key.poll()

  if key.pressed("a") or key.pressed("left") then vx = -0.16; facing = -1
  elseif key.pressed("d") or key.pressed("right") then vx = 0.16; facing = 1
  else vx = 0 end

  if (key.justPressed("w") or key.justPressed(" ") or key.justPressed("up")) and solidAt(px+0.3,py+1.0) then
    vy = -0.42
  end

  if key.justPressed("j") then interactBreak() end
  if key.justPressed("k") then interactPlace() end
  if key.justPressed("1") then selected=1 end
  if key.justPressed("2") then selected=2 end
  if key.justPressed("3") then selected=3 end
  if key.justPressed("4") then selected=4 end
  if key.justPressed("5") then selected=5 end
  if key.justPressed("6") then selected=6 end
  if key.justPressed("7") then selected=7 end
  if key.justPressed("s") then saveWorld() end
  if key.justPressed("l") then loadWorld() end
  if key.justPressed("r") then newWorld() end

  local nx = px + vx
  if not playerBlocked(nx,py) then px=math.max(1,math.min(WORLD_W-1,nx)) end

  vy = math.min(0.45,vy+0.035)
  local ny = py + vy
  if not playerBlocked(px,ny) then py=math.max(1,math.min(WORLD_H-2,ny))
  else
    if vy > 0 then py = math.floor(py+0.95) - 0.95 end
    vy = 0
  end

  camX = math.max(0, math.min(WORLD_W*TILE-SW, (px-1)*TILE-SW/2))
  camY = math.max(0, math.min(WORLD_H*TILE-SH, (py-1)*TILE-SH/2))
  draw()
  return true
end

loop(update)
