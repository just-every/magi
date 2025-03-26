#!/usr/bin/expect -f
# Script to run Claude CLI non-interactively by handling terminal requirements
set timeout 300
set prompt [lindex $argv 0]

# Spawn Claude with the prompt
spawn claude --print --dangerously-skip-permissions -p "$prompt"

# Wait for any output and collect it
set output ""
expect {
    -re {.*} {
        append output $expect_out(0,string)
        exp_continue
    }
    eof
}

# Output the result
puts $output

# Exit cleanly
exit 0