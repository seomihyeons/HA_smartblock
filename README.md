# HA Smart Block  
**Visual Round-Trip Programming Environment for Home Assistant**  




## Home Assistant
[Home Assistant](https://www.home-assistant.io/) is one of the leading open-source IoT platforms.  
It enables users to automate smart devices through YAML-based automation scripts that combine **triggers**, **conditions**, and **actions**.

However, YAML syntax requires users to handle indentation, nested logic, and strict formatting —  
which can make automation difficult for non-developers.




## HA Smart Block
**HA Smart Block** extends the idea of *Smart Block (for SmartThings)* to the **Home Assistant** environment.  
It allows users to **create and edit automations visually** without writing YAML code manually.

When users build their automations with blocks,  
the system automatically generates valid Home Assistant YAML code,  
and conversely, users can import existing YAML files to view and modify them as visual blocks.

Thus, **HA Smart Block provides a true Round-Trip editing environment**:  
YAML ⇄ Visual Blocks ⇄ YAML.

![HA Block](https://github.com/seomihyeons/HA_smartblock/blob/main/ha_smartblock.png)

## How to Access the Program

To run the **HA Smart Block** program locally, first download or clone this repository from GitHub.  
After extracting or cloning the files, open a terminal (PowerShell or VS Code terminal) and navigate to the following path: `/blockly/HA_smartblock`.

Once inside the directory, install dependencies if needed and execute the command below to launch the program:  
```bash
npm run start
```


# Demo Video

You can watch a demonstration of **HA Smart Block** in action on YouTube:  
[Watch the Demo Video](https://youtu.be/jua_SjaCClo?si=6nmnx814JoCcibmV)
