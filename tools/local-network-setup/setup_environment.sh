#!/bin/sh

startingFolder=$(cd ../../../ && pwd)

pathToOtNode="$startingFolder/ot-node"
pathToConfigFiles="$pathToOtNode/tools/local-network-setup/temporary-config-files"

number_of_nodes=4
# Check for script arguments
while [ $# -gt 0 ]; do
  case "$1" in
  	# Override number of nodes if the argument is specified
    --nodes=*)
      number_of_nodes="${1#*=}"
      if [[ $number_of_nodes -le 0 ]]
      then
        echo Cannot run 0 nodes
        exit 1
      elif [[ $number_of_nodes -gt 10 ]]; then
        echo Cannot run more than 10 nodes
        exit 1
      fi
      ;;
    # Print script usage if --help is given
    --help)
      echo "Set up configurations and run a local blockchain and nodes (default 4) locally"
      echo "Use --nodes=<insert_number_here> to specify the number of data nodes to generate (limit 10 nodes)"
      exit 0
      ;;
    *)
      printf "***************************\n"
      printf "* Error: Invalid argument.*\n"
      printf "***************************\n"
      exit 1
  esac
  shift
done

echo ================================
echo ======= Setting up nodes =======
echo ================================

node $pathToOtNode/tools/local-network-setup/generate_config_files.js --number_of_nodes=$number_of_nodes \
--config_path=$pathToConfigFiles --path_to_node=$pathToOtNode

RESULT=$?
if [ $RESULT -ne 0 ]; then
  echo ==================================================
  echo ======== Setting up nodes failed, exiting ========
  echo ==================================================
  exit 1
fi

echo ================================
echo ======== Starting nodes ========
echo ================================

startNode() {
  echo Starting node $1
  osascript -e "tell app \"Terminal\"
      do script \"cd $pathToOtNode
  npm start -- --configDir=$pathToConfigFiles/$1-config-data --config=$pathToConfigFiles/$1.json\"
  end tell"
}


startNode DC

# Start only DC node and exit
if [[ $number_of_nodes -ne 1 ]]
then
  # Wait for the DC node to set up, then start remaining nodes
  echo Waiting for DC node to set up before continuing...
  sleep 15
  i=1
#  while [[ $i -lt $number_of_nodes ]]
#  do
#    startNode DH$i
#    ((i = i + 1))
#  done
fi




