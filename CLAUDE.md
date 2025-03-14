# MAGI System

## Key Commands
- Install dependencies: `pip install -r requirements.txt`
- Install Playwright: `python -m playwright install`
- Run application: `python main.py`
- Run in test mode with auto-exit: `python main.py -t "your command here"`  
- Test specific command: `python main.py -p "your prompt here"`

## Docker Commands
- Build Docker image manually: `python build_docker.py`
- Set OpenAI API Key: `export OPENAI_API_KEY=your-api-key`

## Development Workflow
1. Test changes with `python main.py -t`
3. Verify all functionality works
4. Fix ALL errors found during testing (related or not)
5. Commit with a descriptive message
6. Push to GitHub

Changes should ALWAYS be tested after they are made. If any errors are found (regardless if they are related or not) they should be fixed immediately. Once no errors are found, every change should be committed and pushed without confirmation of commit messages.
